package db

import (
	"log"
	"os"
	"path/filepath"

	"ponytone/pkg/models"

	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

// InitDB initializes the database connection and runs migrations
func InitDB() (*gorm.DB, error) {
	var err error
	var dialector gorm.Dialector

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL != "" {
		log.Printf("Connecting to PostgreSQL database...")
		dialector = postgres.Open(dbURL)
	} else {
		// Detect SQLite database file location
		dbPath := os.Getenv("DB_PATH")
		if dbPath == "" {
			// Check if db.sqlite3 exists in parent directory (running from backend-go/)
			if _, err := os.Stat("../db.sqlite3"); err == nil {
				dbPath = "../db.sqlite3"
			} else {
				// Fall back to current directory
				dbPath = "db.sqlite3"
			}
		}
		absPath, _ := filepath.Abs(dbPath)
		log.Printf("Connecting to SQLite database at: %s", absPath)
		dialector = sqlite.Open(dbPath)
	}

	config := &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	}

	DB, err = gorm.Open(dialector, config)
	if err != nil {
		return nil, err
	}

	log.Println("Database connection established. Running auto-migrations...")
	err = DB.AutoMigrate(
		&models.Song{},
		&models.Party{},
		&models.PartyMember{},
		&models.Playlist{},
		&models.HighScore{},
	)
	if err != nil {
		return nil, err
	}

	log.Println("Database auto-migrations completed successfully.")
	
	// Clear stale party members from the database on startup
	if err := DB.Exec("DELETE FROM karaoke_partymember").Error; err != nil {
		log.Printf("Failed to clear stale party members: %v", err)
	} else {
		log.Println("Cleared stale party members from database.")
	}

	return DB, nil
}
