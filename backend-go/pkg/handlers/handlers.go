package handlers

import (
	"crypto/rand"
	"fmt"
	"log"
	"math/big"
	"strconv"
	"time"

	"ponytone/pkg/db"
	"ponytone/pkg/models"
	"ponytone/pkg/scoring"

	"github.com/gofiber/fiber/v2"
)

// NtpHandler handles clock synchronization requests (NTP-style)
func NtpHandler(c *fiber.Ctx) error {
	now := time.Now().UnixNano() / int64(time.Millisecond)
	tStr := c.Query("t")
	if tStr == "" {
		return c.Status(fiber.StatusBadRequest).SendString("Missing t parameter")
	}
	browserTime, err := strconv.ParseInt(tStr, 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).SendString("Invalid t parameter")
	}
	offset := now - browserTime
	return c.SendString(fmt.Sprintf("%d:%d", offset, browserTime))
}

// TracklistHandler returns the full catalog of songs as JSON
func TracklistHandler(c *fiber.Ctx) error {
	var songs []models.Song
	if err := db.DB.Order("artist asc, title asc").Find(&songs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	type SongListing struct {
		ID    uint     `json:"id"`
		Title string   `json:"title"`
		Artist string  `json:"artist"`
		Length int      `json:"length"`
		Cover string   `json:"cover"`
		Duet  []string `json:"duet,omitempty"`
	}

	results := make([]SongListing, len(songs))
	for i, song := range songs {
		results[i] = SongListing{
			ID:     song.ID,
			Title:  song.Title,
			Artist: song.Artist,
			Length: song.Length,
			Cover:  song.CoverImage,
			Duet:   song.Parts,
		}
	}

	return c.JSON(results)
}

// CreatePartyHandler creates a new party session and returns the 8-character ID
func CreatePartyHandler(c *fiber.Ctx) error {
	var partyID string
	for {
		partyID = generateRandomString(8)
		var count int64
		if err := db.DB.Model(&models.Party{}).Where("id = ?", partyID).Count(&count).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).SendString("Database error")
		}
		if count == 0 {
			break
		}
	}

	party := models.Party{
		ID: partyID,
	}
	if err := db.DB.Create(&party).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).SendString("Failed to create party")
	}

	return c.Type("text").SendString(partyID)
}

// GetHighScoresHandler fetches high scores for a single song
func GetHighScoresHandler(c *fiber.Ctx) error {
	songID, err := c.ParamsInt("song_id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid song ID"})
	}

	var scores []models.HighScore
	if err := db.DB.Where("song_id = ?", songID).Order("score desc").Limit(10).Find(&scores).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(scores)
}

// GetGlobalLeaderboardHandler fetches the top high scores across all songs
func GetGlobalLeaderboardHandler(c *fiber.Ctx) error {
	type LeaderboardEntry struct {
		models.HighScore
		SongTitle  string `json:"song_title"`
		SongArtist string `json:"song_artist"`
	}

	var rawEntries []models.HighScore
	if err := db.DB.Order("score desc").Limit(50).Find(&rawEntries).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	results := make([]LeaderboardEntry, len(rawEntries))
	for i, entry := range rawEntries {
		var song models.Song
		if err := db.DB.First(&song, entry.SongID).Error; err == nil {
			results[i] = LeaderboardEntry{
				HighScore:  entry,
				SongTitle:  song.Title,
				SongArtist: song.Artist,
			}
		} else {
			results[i] = LeaderboardEntry{
				HighScore: entry,
			}
		}
	}
	return c.JSON(results)
}

// SubmitHighScoreHandler verifies and registers a new high score
func SubmitHighScoreHandler(c *fiber.Ctx) error {
	songID, err := c.ParamsInt("song_id")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid song ID"})
	}

	var req struct {
		Nick      string             `json:"nick"`
		Part      int                `json:"part"`
		ReplayLog []scoring.SungNote `json:"replay_log"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if req.Nick == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Nickname is required"})
	}

	// 1. Fetch notes.txt from S3
	notesText, err := scoring.FetchNotesFromS3(uint(songID))
	if err != nil {
		log.Printf("Error fetching notes for song %d: %v", songID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch song notes from S3"})
	}

	// 2. Parse song notes
	song, err := scoring.ParseSongNotes(notesText)
	if err != nil {
		log.Printf("Error parsing notes for song %d: %v", songID, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to parse song notes"})
	}

	// 3. Compute score
	calculatedScore := scoring.CalculateScore(song, req.Part, req.ReplayLog)

	// 4. Save to DB
	highScore := models.HighScore{
		SongID:   uint(songID),
		Nick:     req.Nick,
		Score:    calculatedScore,
		Verified: true,
	}

	if err := db.DB.Create(&highScore).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to save high score"})
	}

	return c.JSON(fiber.Map{
		"message": "High score submitted and verified successfully!",
		"score":   calculatedScore,
	})
}

// Helper to generate cryptographically random 8-character ID
func generateRandomString(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, n)
	for i := range b {
		num, _ := rand.Int(rand.Reader, big.NewInt(int64(len(letters))))
		b[i] = letters[num.Int64()]
	}
	return string(b)
}
