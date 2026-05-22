package main

import (
	"log"
	"os"

	"ponytone/pkg/db"
	"ponytone/pkg/handlers"
	"ponytone/pkg/websocket"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	fiberwebsocket "github.com/gofiber/websocket/v2"
)

func main() {
	// 1. Initialize Database (SQLite/PostgreSQL)
	if _, err := db.InitDB(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	// 2. Initialize Fiber App
	app := fiber.New(fiber.Config{
		AppName: "Ponytone Modernized Server v1.0",
	})

	// 3. Setup Middlewares
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowHeaders: "Origin, Content-Type, Accept",
	}))

	// 4. REST API Routes
	api := app.Group("/api")
	api.Get("/ntp", handlers.NtpHandler)
	api.Get("/tracklist", handlers.TracklistHandler)
	api.Post("/create_party", handlers.CreatePartyHandler)
	api.Get("/leaderboard", handlers.GetGlobalLeaderboardHandler)
	api.Get("/songs/:song_id/highscores", handlers.GetHighScoresHandler)
	api.Post("/songs/:song_id/highscores", handlers.SubmitHighScoreHandler)

	// Keep old paths compatible for old/legacy links
	app.Get("/ntp", handlers.NtpHandler)
	app.Get("/tracklist", handlers.TracklistHandler)
	app.Post("/create_party", handlers.CreatePartyHandler)

	// 5. WebSocket Route for Karaoke Room Relay & Phone Mics
	app.Get("/ws/party/:party_id", fiberwebsocket.New(func(c *fiberwebsocket.Conn) {
		websocket.HandleWebSocket(c)
	}))

	// 6. Serve static files from React build directory
	// In production, Vite compiles files to "frontend/dist"
	distDir := os.Getenv("STATIC_DIR")
	if distDir == "" {
		distDir = "../frontend/dist"
	}
	app.Static("/", distDir)

	// 7. SPA Routing Fallback
	// Serve index.html for all non-API paths so React Router handles the route client-side
	app.Get("/*", func(c *fiber.Ctx) error {
		// Avoid intercepting API routes or websocket requests
		path := c.Path()
		if len(path) >= 4 && path[:4] == "/api" {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "API route not found"})
		}
		if len(path) >= 3 && path[:3] == "/ws" {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "WebSocket path not found"})
		}
		return c.SendFile(distDir + "/index.html")
	})

	// 8. Start Web Server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("Server listening on port %s...", port)
	if err := app.Listen(":" + port); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
