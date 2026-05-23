package websocket

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"sync"
	"time"

	"ponytone/pkg/db"
	"ponytone/pkg/models"

	"github.com/gofiber/websocket/v2"
)

type Client struct {
	Conn          *websocket.Conn
	ChannelName   string
	Nick          string
	Colour        string
	MemberID      uint
	PartyID       string
	IsMic         bool
	IsPlayer      bool   // True if this client represents an active player/singer
	IsDisplay     bool   // True if this client is a display (Con Mode host)
	TargetChannel string // For phone companion mics
	IsReady       bool   // True if the player is ready to sing
	LoadProgress  int    // Song loading progress percentage (0-100)
	Mu            sync.Mutex
}

func (c *Client) Send(msg interface{}) {
	c.Mu.Lock()
	defer c.Mu.Unlock()
	bytes, err := json.Marshal(msg)
	if err != nil {
		return
	}
	_ = c.Conn.WriteMessage(websocket.TextMessage, bytes)
}

type Room struct {
	PartyID              string
	Clients              map[string]*Client // Map of ChannelName -> Client
	ActiveReadyCheckSong uint               // Song currently undergoing ready check
	Assignments          map[string]interface{}
	PartNames            []string
	GameStarted          bool // Guard to prevent duplicate startGame triggers
	Mu                   sync.RWMutex
}

type Hub struct {
	Rooms map[string]*Room
	Mu    sync.RWMutex
}

var GlobalHub = &Hub{
	Rooms: make(map[string]*Room),
}

// GetOrCreateRoom returns an existing room or creates a new one
func (h *Hub) GetOrCreateRoom(partyID string) *Room {
	h.Mu.Lock()
	defer h.Mu.Unlock()

	room, exists := h.Rooms[partyID]
	if !exists {
		room = &Room{
			PartyID: partyID,
			Clients: make(map[string]*Client),
		}
		h.Rooms[partyID] = room
	}
	return room
}

// RemoveRoom removes a room if it is empty
func (h *Hub) RemoveRoom(partyID string) {
	h.Mu.Lock()
	defer h.Mu.Unlock()
	delete(h.Rooms, partyID)
}

type WSMessage struct {
	Action   string      `json:"action"`
	Channel  string      `json:"channel,omitempty"`
	Nick     string      `json:"nick,omitempty"`
	Colour   string      `json:"colour,omitempty"`
	ID       uint        `json:"id,omitempty"`
	Message  interface{} `json:"message,omitempty"`
	Target   string      `json:"target,omitempty"`
	Origin   string      `json:"origin,omitempty"`
	Playlist []uint      `json:"playlist,omitempty"`
	Song     uint        `json:"song,omitempty"`
	Members  interface{} `json:"members,omitempty"`
	Time     int64       `json:"time,omitempty"`
	Track    uint        `json:"track,omitempty"`
	Part     int         `json:"part,omitempty"`
	Score    int         `json:"score,omitempty"`
	Notes    interface{} `json:"notes,omitempty"`
	Note     int         `json:"note"`
	// Extra relay fields passed through verbatim (assignments, partNames, numParts, etc.)
	NumParts       int                      `json:"numParts,omitempty"`
	PartNames      []string                 `json:"partNames,omitempty"`
	Assignments    map[string]interface{}   `json:"assignments,omitempty"`
	Ready          bool                     `json:"ready,omitempty"`
	Progress       int                      `json:"progress,omitempty"`
	ReadyStates    map[string]bool          `json:"readyStates,omitempty"`
	ProgressStates map[string]int           `json:"progressStates,omitempty"`
}

func (r *Room) BroadcastOthers(senderChannel string, msg interface{}) {
	r.Mu.RLock()
	defer r.Mu.RUnlock()

	for ch, client := range r.Clients {
		if ch != senderChannel {
			client.Send(msg)
		}
	}
}

func (r *Room) BroadcastAll(msg interface{}) {
	r.Mu.RLock()
	defer r.Mu.RUnlock()

	for _, client := range r.Clients {
		client.Send(msg)
	}
}

func (r *Room) GetMemberList() map[string]map[string]interface{} {
	r.Mu.RLock()
	defer r.Mu.RUnlock()

	list := make(map[string]map[string]interface{})
	for ch, client := range r.Clients {
		if client.IsPlayer {
			list[ch] = map[string]interface{}{
				"nick":   client.Nick,
				"colour": client.Colour,
				"id":     client.MemberID,
			}
		}
	}
	return list
}

func (r *Room) GetUnusedColour() string {
	r.Mu.RLock()
	defer r.Mu.RUnlock()

	defaultColours := []string{"#058fbe", "#d70000", "#00b100", "#a300c4", "#ee7600", "#57578b"}
	usedColours := make(map[string]bool)
	for _, client := range r.Clients {
		usedColours[client.Colour] = true
	}

	for _, col := range defaultColours {
		if !usedColours[col] {
			return col
		}
	}

	// Generate random hex color if all default colors are taken
	rand.Seed(time.Now().UnixNano())
	return fmt.Sprintf("#%06x", rand.Intn(0xffffff))
}

func GetPlaylist(partyID string) []uint {
	var playlist []models.Playlist
	if err := db.DB.Where("party_id = ?", partyID).Order("`order` asc, id asc").Find(&playlist).Error; err != nil {
		return []uint{}
	}

	songIDs := make([]uint, len(playlist))
	for i, entry := range playlist {
		songIDs[i] = entry.SongID
	}
	return songIDs
}
