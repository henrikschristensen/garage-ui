package main

import (
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"Noooste/garage-ui/internal/auth"
	"Noooste/garage-ui/internal/config"
	"Noooste/garage-ui/internal/handlers"
	"Noooste/garage-ui/internal/routes"
	"Noooste/garage-ui/internal/services"
	"Noooste/garage-ui/pkg/logger"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/recover"
)

//	@title			Garage UI API
//	@version		0.1.0
//	@description	REST API for managing Garage distributed object storage system
//	@description	This API provides endpoints for managing buckets, objects, users, and cluster operations.
//	@termsOfService	http://swagger.io/terms/

//	@license.name	MIT
//	@license.url	https://opensource.org/licenses/MIT

//	@host		localhost:8080
//	@BasePath	/
//	@schemes	http https

//	@tag.name			Health
//	@tag.description	Health check endpoints

//	@tag.name			Buckets
//	@tag.description	Bucket management operations

//	@tag.name			Objects
//	@tag.description	Object storage and retrieval operations

//	@tag.name			Users
//	@tag.description	User and access key management

//	@tag.name			Cluster
//	@tag.description	Cluster status and node management

//	@tag.name			Monitoring
//	@tag.description	Monitoring and metrics endpoints

//	@securityDefinitions.apikey	BearerAuth
//	@in							header
//	@name						Authorization
//	@description				Type "Bearer" followed by a space and JWT token.

var version = "dev"

func main() {
	// Parse command-line flags
	configPath := flag.String("config", "config.yaml", "Path to configuration file")
	flag.Parse()

	// Load configuration first (before initializing logger)
	cfg, err := config.Load(*configPath)
	if err != nil {
		// If config fails to load, use default logger to report the error
		logger.Get().Fatal().Err(err).Str("config_path", *configPath).Msg("Failed to load configuration")
	}

	// Initialize logger with configuration from config file
	logger.Init(logger.Config{
		Level:  cfg.Logging.Level,
		Format: cfg.Logging.Format,
	})

	// Now log with the properly configured logger
	logger.Info().
		Str("config_path", *configPath).
		Str("version", version).
		Str("environment", cfg.Server.Environment).
		Msg("Starting Garage UI Backend")

	// Initialize services
	logger.Info().Msg("Initializing Garage Admin service")
	adminService := services.NewGarageAdminService(&cfg.Garage, cfg.Logging.Level)

	logger.Info().Msg("Initializing S3 service")
	s3Service := services.NewS3Service(&cfg.Garage, adminService)

	// Determine enabled auth methods for logging
	authMethods := []string{}
	if cfg.Auth.Admin.Enabled {
		authMethods = append(authMethods, "admin")
	}
	if cfg.Auth.OIDC.Enabled {
		authMethods = append(authMethods, "oidc")
	}
	if len(authMethods) == 0 {
		authMethods = append(authMethods, "none")
	}
	logger.Info().Strs("enabled_methods", authMethods).Msg("Initializing authentication service")
	authService, err := auth.NewAuthService(&cfg.Auth, &cfg.Server)
	if err != nil {
		logger.Fatal().Err(err).Msg("Failed to initialize auth service")
	}

	// Initialize handlers
	healthHandler := handlers.NewHealthHandler(version)
	bucketHandler := handlers.NewBucketHandler(adminService, s3Service)
	objectHandler := handlers.NewObjectHandler(s3Service)
	userHandler := handlers.NewUserHandler(adminService)
	clusterHandler := handlers.NewClusterHandler(adminService)
	monitoringHandler := handlers.NewMonitoringHandler(adminService, s3Service)

	// Set default values for buffer sizes if not configured
	maxBodySize := cfg.Server.MaxBodySize
	if maxBodySize == 0 {
		maxBodySize = 300 * 1024 * 1024 // 300MB default
	}
	maxHeaderSize := cfg.Server.MaxHeaderSize
	if maxHeaderSize == 0 {
		maxHeaderSize = 1 * 1024 * 1024 // 1MB default
	}
	readBufferSize := cfg.Server.ReadBufferSize
	if readBufferSize == 0 {
		readBufferSize = 4096 // 4KB default
	}
	writeBufferSize := cfg.Server.WriteBufferSize
	if writeBufferSize == 0 {
		writeBufferSize = 4096 // 4KB default
	}

	logger.Info().
		Int64("max_body_bytes", maxBodySize).
		Float64("max_body_mb", float64(maxBodySize)/(1024*1024)).
		Int("max_header_bytes", maxHeaderSize).
		Float64("max_header_kb", float64(maxHeaderSize)/1024).
		Msg("Server request limits configured")

	// Create Fiber app with configuration
	app := fiber.New(fiber.Config{
		AppName:         "Garage UI Backend | Version: " + version,
		BodyLimit:       int(maxBodySize),
		ReadBufferSize:  readBufferSize,
		WriteBufferSize: writeBufferSize,
		ErrorHandler:    customErrorHandler,
	})

	// Apply global middleware
	app.Use(recover.New()) // Panic recovery

	// Setup routes
	logger.Info().Msg("Setting up routes")
	routes.SetupRoutes(
		app,
		cfg,
		authService,
		healthHandler,
		bucketHandler,
		objectHandler,
		userHandler,
		clusterHandler,
		monitoringHandler,
	)

	// Start server in a goroutine
	go func() {
		addr := cfg.GetAddress()
		logger.Info().
			Str("address", addr).
			Str("health_endpoint", fmt.Sprintf("http://%s/health", addr)).
			Str("api_docs", fmt.Sprintf("http://%s/api/v1/", addr)).
			Msg("Server starting")

		if err := app.Listen(addr); err != nil {
			logger.Fatal().Err(err).Msg("Failed to start server")
		}
	}()

	// Wait for interrupt signal to gracefully shutdown the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
	<-quit

	logger.Info().Msg("Shutting down server")
	if err := app.Shutdown(); err != nil {
		logger.Fatal().Err(err).Msg("Server shutdown failed")
	}

	logger.Info().Msg("Server stopped gracefully")
}

// customErrorHandler handles errors globally
func customErrorHandler(c fiber.Ctx, err error) error {
	// Default to 500 Internal Server Error
	code := fiber.StatusInternalServerError

	// Check if it's a Fiber error
	if e, ok := err.(*fiber.Error); ok {
		code = e.Code
	}

	// Log the error
	logger.Error().
		Err(err).
		Int("status_code", code).
		Str("method", c.Method()).
		Str("path", c.Path()).
		Msg("Request error")

	// Return JSON error response
	return c.Status(code).JSON(fiber.Map{
		"success": false,
		"error": fiber.Map{
			"code":    fmt.Sprintf("ERROR_%d", code),
			"message": err.Error(),
		},
	})
}
