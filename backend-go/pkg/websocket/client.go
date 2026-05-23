package websocket

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"sync/atomic"
	"time"

	"ponytone/pkg/db"
	"ponytone/pkg/models"

	"github.com/gofiber/websocket/v2"
)

var memberIdSeq uint32 = 1000

func getNextMemberID() uint {
	return uint(atomic.AddUint32(&memberIdSeq, 1))
}

// HandleWebSocket handles incoming WebSocket requests for a room
func HandleWebSocket(c *websocket.Conn) {
	partyID := c.Params("party_id")
	nick := c.Query("nick")
	isMic := c.Query("mic") == "true"
	isDisplay := c.Query("display") == "true"
	targetChan := c.Query("target")

	// Generate a unique channel name for this client
	channelName := fmt.Sprintf("client-%s", generateSecureRandomString(12))

	room := GlobalHub.GetOrCreateRoom(partyID)

	// Check room capacity (e.g. limit to 32 to support larger tournament lobbies)
	if !isMic && !isDisplay {
		room.Mu.RLock()
		activeCount := 0
		for _, cl := range room.Clients {
			if !cl.IsMic && !cl.IsDisplay {
				activeCount++
			}
		}
		room.Mu.RUnlock()

		if activeCount >= 32 {
			_ = c.WriteJSON(WSMessage{
				Action:  "goodbye",
				Message: "room_full",
			})
			_ = c.Close()
			return
		}
	}

	memberID := getNextMemberID()

	client := &Client{
		Conn:          c,
		ChannelName:   channelName,
		Nick:          nick,
		PartyID:       partyID,
		IsMic:         isMic,
		IsPlayer:      !isMic && !isDisplay, // Set IsPlayer to true if not a mic and not a display
		IsDisplay:     isDisplay,
		TargetChannel: targetChan,
		MemberID:      memberID,
	}

	// 1. If not a mic and not a display, write connection record to database
	if !isMic && !isDisplay {
		member := models.PartyMember{
			ID:            memberID,
			PartyID:       partyID,
			Channel:       channelName,
			Participating: true,
		}
		if nick != "" {
			member.Nick = &nick
		}
		if err := db.DB.Create(&member).Error; err != nil {
			log.Printf("Failed to create party member in DB: %v", err)
			_ = c.Close()
			return
		}
	}

	// Register client in Room
	room.Mu.Lock()
	room.Clients[channelName] = client
	room.Mu.Unlock()

	defer func() {
		// Cleanup on disconnect
		room.Mu.Lock()
		delete(room.Clients, channelName)
		empty := len(room.Clients) == 0
		room.Mu.Unlock()

		if client.IsPlayer {
			// Delete party member from DB
			db.DB.Where("channel = ?", channelName).Delete(&models.PartyMember{})

			// Broadcast member left
			room.BroadcastOthers(channelName, WSMessage{
				Action:  "member_left",
				Channel: channelName,
				Nick:    client.Nick,
			})

			broadcastReadyStates(room)
			checkAndTriggerGameStart(room, partyID)
		}

		if client.TargetChannel != "" {
			room.Mu.RLock()
			targetClient, ok := room.Clients[client.TargetChannel]
			room.Mu.RUnlock()
			if ok {
				targetClient.Send(WSMessage{
					Action: "micDisconnected",
					Origin: channelName,
				})
			}
		}

		if empty {
			GlobalHub.RemoveRoom(partyID)
		}
		_ = c.Close()
	}()

	// Send accept / hello handshake
	client.Send(WSMessage{
		Action:  "hello",
		Channel: channelName,
		Members: room.GetMemberList(), // Send current members to all clients, including mics
	})

	// Message loop
	for {
		_, msg, err := c.ReadMessage()
		if err != nil {
			break
		}

		var wsMsg WSMessage
		if err := json.Unmarshal(msg, &wsMsg); err != nil {
			continue
		}

		switch wsMsg.Action {
		case "hello":
			if !isMic && !client.IsDisplay {
				client.Nick = wsMsg.Nick
				client.Colour = room.GetUnusedColour()
				client.IsPlayer = true
				client.IsReady = false

				// Update database
				db.DB.Model(&models.PartyMember{}).Where("channel = ?", channelName).Updates(map[string]interface{}{
					"nick":   client.Nick,
					"colour": client.Colour,
				})

				// Send current member list & playlist
				client.Send(WSMessage{
					Action:  "member_list",
					Members: room.GetMemberList(),
				})
				client.Send(WSMessage{
					Action:   "playlist",
					Playlist: GetPlaylist(partyID),
				})

				// Broadcast new member to others
				room.BroadcastOthers(channelName, WSMessage{
					Action:  "new_member",
					Channel: channelName,
					Nick:    client.Nick,
					Colour:  client.Colour,
					ID:      client.MemberID,
				})
			} else if client.IsDisplay {
				// Send current member list & playlist to the display client
				client.Send(WSMessage{
					Action:  "member_list",
					Members: room.GetMemberList(),
				})
				client.Send(WSMessage{
					Action:   "playlist",
					Playlist: GetPlaylist(partyID),
				})
			}
			broadcastReadyStates(room)
			checkAndTriggerGameStart(room, partyID)

		case "registerPlayer":
			client.Nick = wsMsg.Nick
			client.Colour = room.GetUnusedColour()
			client.IsPlayer = true
			client.IsReady = false

			// Create connection record in PartyMember DB
			member := models.PartyMember{
				ID:            client.MemberID,
				PartyID:       partyID,
				Channel:       channelName,
				Participating: true,
			}
			if client.Nick != "" {
				member.Nick = &client.Nick
			}
			if client.Colour != "" {
				member.Colour = &client.Colour
			}
			db.DB.Create(&member)

			// Send current member list & playlist to the registered player
			client.Send(WSMessage{
				Action:  "member_list",
				Members: room.GetMemberList(),
			})
			client.Send(WSMessage{
				Action:   "playlist",
				Playlist: GetPlaylist(partyID),
			})

			// Broadcast new member to all room participants
			room.BroadcastAll(WSMessage{
				Action:  "new_member",
				Channel: channelName,
				Nick:    client.Nick,
				Colour:  client.Colour,
				ID:      client.MemberID,
			})

			broadcastReadyStates(room)
			checkAndTriggerGameStart(room, partyID)

		case "pairMic":
			client.TargetChannel = wsMsg.Target
			client.IsPlayer = false // Mics that are paired are not independent players

			// Send pairing confirmation to the mic
			client.Send(WSMessage{
				Action: "micPaired",
				Target: client.TargetChannel,
			})

			// Also notify the target client that a mic has paired with them
			room.Mu.RLock()
			targetClient, ok := room.Clients[client.TargetChannel]
			room.Mu.RUnlock()
			if ok {
				targetClient.Send(WSMessage{
					Action: "micPaired",
					Origin: channelName,
				})
			}

		case "relay":
			// Direct message relay (e.g. ICE signaling for audio stream)
			room.Mu.RLock()
			targetClient, ok := room.Clients[wsMsg.Target]
			room.Mu.RUnlock()

			if ok {
				targetClient.Send(WSMessage{
					Action: "relay",
					Origin: channelName,
					Message: wsMsg.Message,
				})
			}

		case "addToQueue":
			// Check if already in queue
			var count int64
			db.DB.Model(&models.Playlist{}).Where("party_id = ? AND song_id = ?", partyID, wsMsg.Song).Count(&count)
			if count == 0 {
				var maxOrder uint
				db.DB.Model(&models.Playlist{}).Where("party_id = ?", partyID).Select("COALESCE(MAX(`order`), 0)").Row().Scan(&maxOrder)

				entry := models.Playlist{
					PartyID: partyID,
					SongID:  wsMsg.Song,
					Order:   maxOrder + 1,
				}
				db.DB.Create(&entry)
			}

			// Broadcast updated playlist to room
			room.BroadcastAll(WSMessage{
				Action:   "playlist",
				Playlist: GetPlaylist(partyID),
			})

			checkAndTriggerGameStart(room, partyID)

		case "removeFromQueue":
			db.DB.Where("party_id = ? AND song_id = ?", partyID, wsMsg.Song).Delete(&models.Playlist{})

			// Broadcast updated playlist to room
			room.BroadcastAll(WSMessage{
				Action:   "playlist",
				Playlist: GetPlaylist(partyID),
			})

		case "clearQueue":
			db.DB.Where("party_id = ?", partyID).Delete(&models.Playlist{})
			room.BroadcastAll(WSMessage{
				Action:   "playlist",
				Playlist: []uint{},
			})

		case "loadTrack":
			// Remove the loaded song from the playlist queue
			db.DB.Where("party_id = ? AND song_id = ?", partyID, wsMsg.Song).Delete(&models.Playlist{})

			// Broadcast updated playlist to all clients
			room.BroadcastAll(WSMessage{
				Action:   "playlist",
				Playlist: GetPlaylist(partyID),
			})

			room.Mu.Lock()
			room.GameStarted = false
			room.Mu.Unlock()

			// Relay the loadTrack command to all clients
			room.BroadcastAll(wsMsg)

		case "startGame":
			room.BroadcastAll(wsMsg)

		case "ping":
			// Reply with pong to verify connection is alive
			client.Send(WSMessage{
				Action: "pong",
			})

		case "startReadyCheck":
			// No-op in persistent lobby ready check system

		case "readyToGo":
			room.Mu.Lock()
			targetClient := client
			if client.IsMic && client.TargetChannel != "" {
				if tc, ok := room.Clients[client.TargetChannel]; ok {
					targetClient = tc
				}
			}
			targetClient.IsReady = wsMsg.Ready
			room.Mu.Unlock()

			broadcastReadyStates(room)
			checkAndTriggerGameStart(room, partyID)

		case "cancelReadyCheck":
			// No-op in persistent lobby ready check system

		case "songFinished":
			room.BroadcastAll(wsMsg)

		case "returnedToLobby":
			room.Mu.Lock()
			room.GameStarted = false
			for _, cl := range room.Clients {
				cl.IsReady = false
				cl.LoadProgress = 0
			}
			room.Mu.Unlock()
			broadcastReadyStates(room)
			room.BroadcastAll(wsMsg)

		case "loadProgress":
			room.Mu.Lock()
			client.LoadProgress = wsMsg.Progress
			room.Mu.Unlock()

			checkAndStartGame(room)

		case "trackLoaded":
			room.Mu.Lock()
			room.Assignments = wsMsg.Assignments
			room.PartNames = wsMsg.PartNames
			client.LoadProgress = 100
			room.Mu.Unlock()

			// Relay trackLoaded message to all other participants so phones can configure duet choices
			wsMsg.Origin = channelName
			wsMsg.Target = client.TargetChannel
			if isMic && client.TargetChannel != "" {
				room.Mu.RLock()
				primaryClient, ok := room.Clients[client.TargetChannel]
				room.Mu.RUnlock()
				if ok {
					primaryClient.Send(wsMsg)
				}
			} else {
				room.BroadcastOthers(channelName, wsMsg)
			}

			checkAndStartGame(room)

		case "selectPart":
			room.Mu.Lock()
			if room.Assignments == nil {
				room.Assignments = make(map[string]interface{})
			}
			targetChan := wsMsg.Channel
			if targetChan == "" {
				if client.IsMic && client.TargetChannel != "" {
					targetChan = client.TargetChannel
				} else {
					targetChan = channelName
				}
			}
			room.Assignments[targetChan] = wsMsg.Part
			room.Mu.Unlock()

			// Broadcast/relay selectPart to other room participants
			wsMsg.Origin = channelName
			wsMsg.Target = client.TargetChannel
			if isMic && client.TargetChannel != "" {
				room.Mu.RLock()
				primaryClient, ok := room.Clients[client.TargetChannel]
				room.Mu.RUnlock()
				if ok {
					primaryClient.Send(wsMsg)
				}
			} else {
				room.BroadcastOthers(channelName, wsMsg)
			}

		case "sangNotes", "micPitch":
			// Broadcast gameplay and pitch data to other room participants
			// If companion mic, it might target the primary browser screen instead
			wsMsg.Origin = channelName
			wsMsg.Target = client.TargetChannel
			if isMic && client.TargetChannel != "" {
				room.Mu.RLock()
				primaryClient, ok := room.Clients[client.TargetChannel]
				room.Mu.RUnlock()
				if ok {
					primaryClient.Send(wsMsg)
				}
			} else {
				room.BroadcastOthers(channelName, wsMsg)
			}
		}
	}
}

// checkAndStartGame evaluates progress across all computer clients in the room,
// and starts the game automatically if all have hit 100%.
func checkAndStartGame(room *Room) {
	room.Mu.Lock()
	progressStates := make(map[string]int)
	allComplete := true
	hasComputers := false
	for ch, cl := range room.Clients {
		if !cl.IsMic {
			hasComputers = true
			progressStates[ch] = cl.LoadProgress
			if cl.LoadProgress < 100 {
				allComplete = false
			}
		}
	}

	shouldStart := hasComputers && allComplete && !room.GameStarted
	if shouldStart {
		room.GameStarted = true
	}
	room.Mu.Unlock()

	// Broadcast the progress states update
	room.BroadcastAll(WSMessage{
		Action:         "loadProgressUpdate",
		ProgressStates: progressStates,
	})

	if shouldStart {
		room.Mu.Lock()
		assignments := make(map[string]interface{})
		for ch, pIdxVal := range room.Assignments {
			pIdx := 0
			switch v := pIdxVal.(type) {
			case float64:
				pIdx = int(v)
			case int:
				pIdx = v
			}

			partName := "Solo"
			if len(room.PartNames) > 1 {
				if pIdx >= 0 && pIdx < len(room.PartNames) {
					partName = room.PartNames[pIdx]
				} else {
					partName = fmt.Sprintf("Part %d", pIdx+1)
				}
			}
			assignments[ch] = map[string]interface{}{
				"partIndex": pIdx,
				"partName":  partName,
			}
		}
		room.Mu.Unlock()

		// Get synchronized absolute time: now + 3000ms
		serverStartTimestamp := time.Now().UnixNano()/int64(time.Millisecond) + 3000

		room.BroadcastAll(WSMessage{
			Action:      "startGame",
			Time:        serverStartTimestamp,
			Assignments: assignments,
		})
	}
}

// Generate secure random string helper
func generateSecureRandomString(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, n)
	for i := range b {
		num, _ := rand.Int(rand.Reader, big.NewInt(int64(len(letters))))
		b[i] = letters[num.Int64()]
	}
	return string(b)
}

// broadcastReadyStates gathers all players' ready states and broadcasts them to everyone in the room.
func broadcastReadyStates(room *Room) {
	room.Mu.Lock()
	readyStates := make(map[string]bool)
	for ch, cl := range room.Clients {
		if cl.IsPlayer {
			readyStates[ch] = cl.IsReady
		}
	}
	room.Mu.Unlock()

	room.BroadcastAll(WSMessage{
		Action:      "readyCheckUpdate",
		ReadyStates: readyStates,
	})
}

// checkAndTriggerGameStart evaluates if there are active players, if they are all ready,
// and if there's a song in the playlist queue. If so, it starts the song loading phase automatically.
func checkAndTriggerGameStart(room *Room, partyID string) {
	room.Mu.Lock()
	allReady := true
	hasPlayers := false
	for _, cl := range room.Clients {
		if cl.IsPlayer {
			hasPlayers = true
			if !cl.IsReady {
				allReady = false
			}
		}
	}
	room.Mu.Unlock()

	if hasPlayers && allReady {
		playlist := GetPlaylist(partyID)
		if len(playlist) > 0 {
			songID := playlist[0]

			room.Mu.Lock()
			room.GameStarted = false
			// Reset progress states for the loading screen
			for _, cl := range room.Clients {
				cl.LoadProgress = 0
			}
			room.Mu.Unlock()

			// Remove from queue
			db.DB.Where("party_id = ? AND song_id = ?", partyID, songID).Delete(&models.Playlist{})

			// Broadcast updated playlist
			room.BroadcastAll(WSMessage{
				Action:   "playlist",
				Playlist: GetPlaylist(partyID),
			})

			// Broadcast loadTrack
			room.BroadcastAll(WSMessage{
				Action: "loadTrack",
				Song:   songID,
			})
		}
	}
}

