package websocket

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"sync/atomic"

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

		case "registerPlayer":
			client.Nick = wsMsg.Nick
			client.Colour = room.GetUnusedColour()
			client.IsPlayer = true

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

		case "removeFromQueue":
			db.DB.Where("party_id = ? AND song_id = ?", partyID, wsMsg.Song).Delete(&models.Playlist{})

			// Broadcast updated playlist to room
			room.BroadcastAll(WSMessage{
				Action:   "playlist",
				Playlist: GetPlaylist(partyID),
			})

		case "loadTrack":
			// Remove the loaded song from the playlist queue
			db.DB.Where("party_id = ? AND song_id = ?", partyID, wsMsg.Song).Delete(&models.Playlist{})

			// Broadcast updated playlist to all clients
			room.BroadcastAll(WSMessage{
				Action:   "playlist",
				Playlist: GetPlaylist(partyID),
			})

			// Relay the loadTrack command to all clients
			room.BroadcastAll(wsMsg)

		case "startGame":
			room.BroadcastAll(wsMsg)

		case "readyToGo", "trackLoaded", "sangNotes", "micPitch", "selectPart":
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
