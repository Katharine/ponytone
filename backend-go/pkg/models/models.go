package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// StringArray is a custom type to handle both PostgreSQL string arrays {"a","b"} and JSON string arrays ["a","b"]
type StringArray []string

func (a *StringArray) Scan(value interface{}) error {
	if value == nil {
		*a = nil
		return nil
	}

	var str string
	switch v := value.(type) {
	case string:
		str = v
	case []byte:
		str = string(v)
	default:
		return fmt.Errorf("unsupported type for StringArray: %T", value)
	}

	str = strings.TrimSpace(str)
	if len(str) == 0 {
		*a = nil
		return nil
	}

	// Check if PostgreSQL array: {"Part 1","Part 2"}
	if strings.HasPrefix(str, "{") && strings.HasSuffix(str, "}") {
		str = str[1 : len(str)-1]
		if len(str) == 0 {
			*a = []string{}
			return nil
		}

		var result []string
		inQuotes := false
		var current strings.Builder
		for i := 0; i < len(str); i++ {
			char := str[i]
			if char == '"' {
				inQuotes = !inQuotes
			} else if char == ',' && !inQuotes {
				result = append(result, current.String())
				current.Reset()
			} else {
				current.WriteByte(char)
			}
		}
		result = append(result, current.String())
		*a = result
		return nil
	}

	// Check if JSON array: ["Part 1", "Part 2"]
	if strings.HasPrefix(str, "[") && strings.HasSuffix(str, "]") {
		return json.Unmarshal([]byte(str), a)
	}

	// Fallback to comma-separated
	*a = strings.Split(str, ",")
	return nil
}

func (a StringArray) Value() (driver.Value, error) {
	if a == nil {
		return nil, nil
	}
	// Format as PostgreSQL array format for compatibility
	var elements []string
	for _, val := range a {
		escaped := strings.ReplaceAll(val, "\"", "\\\"")
		elements = append(elements, fmt.Sprintf("\"%s\"", escaped))
	}
	return fmt.Sprintf("{%s}", strings.Join(elements, ",")), nil
}

type Song struct {
	ID           uint        `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	Title        string      `gorm:"column:title;index;size:255;not null" json:"title"`
	Artist       string      `gorm:"column:artist;index;size:255;not null" json:"artist"`
	SongYear     *int        `gorm:"column:song_year;index" json:"song_year"`
	Transcriber  *string     `gorm:"column:transcriber;size:255" json:"transcriber"`
	IsMlk        bool        `gorm:"column:is_mlk;default:false;not null" json:"is_mlk"`
	Genre        string      `gorm:"column:genre;size:255;not null" json:"genre"`
	Updated      *time.Time  `gorm:"column:updated;type:date" json:"updated"`
	Language     string      `gorm:"column:language;index;size:255;not null" json:"language"`
	Length       int         `gorm:"column:length;index;not null" json:"length"`
	PreviewStart *int        `gorm:"column:preview_start" json:"preview_start"`
	Parts        StringArray `gorm:"column:parts;type:text" json:"parts"`
	CoverImage   string      `gorm:"column:cover_image;size:100" json:"cover_image"`
}

func (Song) TableName() string { return "karaoke_song" }

type Party struct {
	ID      string    `gorm:"column:id;primaryKey;size:10" json:"id"`
	Created time.Time `gorm:"column:created;not null;autoCreateTime" json:"created"`
}

func (Party) TableName() string { return "karaoke_party" }

type PartyMember struct {
	ID            uint    `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	PartyID       string  `gorm:"column:party_id;size:10;index;not null" json:"party_id"`
	Nick          *string `gorm:"column:nick;size:30" json:"nick"`
	Colour        *string `gorm:"column:colour;size:7" json:"colour"`
	Participating bool    `gorm:"column:participating;default:true;not null" json:"participating"`
	Channel       string  `gorm:"column:channel;size:255;uniqueIndex;not null" json:"channel"`
}

func (PartyMember) TableName() string { return "karaoke_partymember" }

type Playlist struct {
	ID      uint   `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	PartyID string `gorm:"column:party_id;size:10;not null" json:"party_id"`
	SongID  uint   `gorm:"column:song_id;not null" json:"song_id"`
	Order   uint   `gorm:"column:order;not null" json:"order"`
}

func (Playlist) TableName() string { return "karaoke_playlist" }

type HighScore struct {
	ID        uint      `gorm:"column:id;primaryKey;autoIncrement" json:"id"`
	SongID    uint      `gorm:"column:song_id;index;not null" json:"song_id"`
	Nick      string    `gorm:"column:nick;size:50;not null" json:"nick"`
	Score     int       `gorm:"column:score;not null" json:"score"`
	Verified  bool      `gorm:"column:verified;default:false;not null" json:"verified"`
	CreatedAt time.Time `gorm:"column:created_at;not null;autoCreateTime" json:"created_at"`
}

func (HighScore) TableName() string { return "karaoke_highscore" }
