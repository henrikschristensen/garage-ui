package routes

import (
	"Noooste/garage-ui/internal/auth"
	"Noooste/garage-ui/internal/config"
	"Noooste/garage-ui/internal/handlers"
	"Noooste/garage-ui/internal/middleware"
	"Noooste/garage-ui/pkg/logger"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/gofiber/fiber/v3"
	// Swagger imports
	_ "Noooste/garage-ui/docs"

	"github.com/Noooste/swagger"
)

// SetupRoutes configures all API routes
func SetupRoutes(
	app *fiber.App,
	cfg *config.Config,
	authService *auth.Service,
	healthHandler *handlers.HealthHandler,
	bucketHandler *handlers.BucketHandler,
	objectHandler *handlers.ObjectHandler,
	userHandler *handlers.UserHandler,
	clusterHandler *handlers.ClusterHandler,
	monitoringHandler *handlers.MonitoringHandler,
) {
	// Apply CORS middleware globally
	app.Use(middleware.CORSMiddleware(&cfg.CORS))

	// Health check endpoint (no auth required)
	app.Get("/health", healthHandler.Check)
	app.Get("/api/v1/health", healthHandler.Check)

	// Swagger documentation endpoint (no auth required)
	app.Get("/docs/*", swagger.HandlerDefault)

	// Create auth handler
	authHandler := handlers.NewAuthHandler(cfg, authService)

	// Auth configuration endpoint (always accessible, no auth required)
	app.Get("/auth/config", authHandler.GetAuthConfig)

	// API v1 group
	api := app.Group("/api/v1")

	// Apply authentication middleware to all API routes
	api.Use(middleware.AuthMiddleware(&cfg.Auth, authService))

	// Bucket routes
	buckets := api.Group("/buckets")
	{
		buckets.Get("/", bucketHandler.ListBuckets)                             // List all buckets
		buckets.Post("/", bucketHandler.CreateBucket)                           // Create a new bucket
		buckets.Get("/:name", bucketHandler.GetBucketInfo)                      // Get bucket info
		buckets.Delete("/:name", bucketHandler.DeleteBucket)                    // Delete a bucket
		buckets.Post("/:name/permissions", bucketHandler.GrantBucketPermission) // Grant bucket permissions
		buckets.Put("/:name/website", bucketHandler.UpdateBucketWebsite)        // Update bucket website configuration
	}

	// Object routes
	objects := api.Group("/buckets/:bucket/objects")
	{
		objects.Get("/", objectHandler.ListObjects)                           // List objects in bucket
		objects.Post("/", objectHandler.UploadObject)                         // Upload object (multipart)
		objects.Post("/upload-multiple", objectHandler.UploadMultipleObjects) // Upload multiple objects
		objects.Post("/delete-multiple", objectHandler.DeleteMultipleObjects) // Delete multiple objects
	}

	// Object-specific routes with wildcard key parameter (supports paths with slashes)
	// These need to be registered on the main app with auth middleware applied
	objectWildcardHandler := func(c fiber.Ctx) error {
		// Get the full path from wildcard parameter
		// Note: Fiber v3 does NOT automatically decode params, we need to do it manually
		path := c.Params("*")

		// Decode the full path using QueryUnescape (handles %20, %2F, etc.)
		decodedPath, err := url.QueryUnescape(path)
		if err != nil {
			// If decoding fails, use the original path
			decodedPath = path
		}

		// Check if it's a metadata request
		if strings.HasSuffix(decodedPath, "/metadata") {
			// Remove /metadata suffix to get the actual key
			key := strings.TrimSuffix(decodedPath, "/metadata")
			c.Locals("objectKey", key)
			return objectHandler.GetObjectMetadata(c)
		}
		// Check if it's a presign request
		if strings.HasSuffix(decodedPath, "/presign") {
			// Remove /presign suffix to get the actual key
			key := strings.TrimSuffix(decodedPath, "/presign")
			c.Locals("objectKey", key)
			return objectHandler.GetPresignedURL(c)
		}
		// Otherwise, it's a regular object download
		c.Locals("objectKey", decodedPath)
		return objectHandler.GetObject(c)
	}

	objectDeleteHandler := func(c fiber.Ctx) error {
		path := c.Params("*")

		// Decode the full path using QueryUnescape
		key, err := url.QueryUnescape(path)
		if err != nil {
			// If decoding fails, use the original path
			key = path
		}

		c.Locals("objectKey", key)
		return objectHandler.DeleteObject(c)
	}

	objectHeadHandler := func(c fiber.Ctx) error {
		path := c.Params("*")

		// Decode the full path using QueryUnescape
		key, err := url.QueryUnescape(path)
		if err != nil {
			// If decoding fails, use the original path
			key = path
		}

		c.Locals("objectKey", key)
		return objectHandler.GetObjectMetadata(c)
	}

	// Register with auth middleware
	app.Get("/api/v1/buckets/:bucket/objects/*", middleware.AuthMiddleware(&cfg.Auth, authService), objectWildcardHandler)
	app.Delete("/api/v1/buckets/:bucket/objects/*", middleware.AuthMiddleware(&cfg.Auth, authService), objectDeleteHandler)
	app.Head("/api/v1/buckets/:bucket/objects/*", middleware.AuthMiddleware(&cfg.Auth, authService), objectHeadHandler)

	// User/Key management routes
	users := api.Group("/users")
	{
		users.Get("/", userHandler.ListUsers)                          // List all users/keys
		users.Post("/", userHandler.CreateUser)                        // Create new user/key
		users.Get("/:access_key", userHandler.GetUser)                 // Get user info
		users.Get("/:access_key/secret", userHandler.GetUserSecretKey) // Get user secret key
		users.Delete("/:access_key", userHandler.DeleteUser)           // Delete user/key
		users.Patch("/:access_key", userHandler.UpdateUserPermissions) // Update user permissions
	}

	// Cluster management routes
	cluster := api.Group("/cluster")
	{
		cluster.Get("/health", clusterHandler.GetHealth)                            // Get cluster health
		cluster.Get("/status", clusterHandler.GetStatus)                            // Get cluster status
		cluster.Get("/statistics", clusterHandler.GetStatistics)                    // Get cluster statistics
		cluster.Get("/nodes/:node_id", clusterHandler.GetNodeInfo)                  // Get node info
		cluster.Get("/nodes/:node_id/statistics", clusterHandler.GetNodeStatistics) // Get node statistics
	}

	// Monitoring routes
	monitoring := api.Group("/monitoring")
	{
		monitoring.Get("/metrics", monitoringHandler.GetMetrics)            // Get Prometheus metrics
		monitoring.Get("/admin-health", monitoringHandler.CheckAdminHealth) // Check Admin API health
		monitoring.Get("/dashboard", monitoringHandler.GetDashboardMetrics) // Get dashboard metrics
	}

	// Admin auth login endpoint (only if admin is enabled)
	if cfg.Auth.Admin.Enabled {
		app.Post("/auth/login", authHandler.LoginAdmin)
	}

	// Auth "me" endpoint (if any auth is enabled)
	if cfg.Auth.Admin.Enabled || cfg.Auth.OIDC.Enabled {
		app.Get("/auth/me", middleware.AuthMiddleware(&cfg.Auth, authService), authHandler.GetMe)
	}

	// OIDC authentication routes (only if OIDC is enabled)
	if cfg.Auth.OIDC.Enabled {
		oidcRoutes := app.Group("/auth/oidc")
		{
			// Login endpoint - redirects to OIDC provider
			oidcRoutes.Get("/login", func(c fiber.Ctx) error {
				state, err := authService.GenerateStateToken()
				if err != nil {
					return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
						"error": "Failed to generate state token",
					})
				}

				authURL, err := authService.GetAuthorizationURL(state)
				if err != nil {
					return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
						"error": "Failed to generate login URL",
					})
				}
				return c.Redirect().To(authURL)
			})

			// Callback endpoint - handles OIDC redirect after login
			oidcRoutes.Get("/callback", func(c fiber.Ctx) error {
				// Get and validate state token
				state := c.Query("state")
				if !authService.ValidateAndConsumeState(state) {
					return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
						"error": "Invalid or expired state token",
					})
				}

				// Get authorization code from query
				code := c.Query("code")
				if code == "" {
					return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
						"error": "Authorization code is required",
					})
				}

				// Exchange code for tokens
				ctx := c.Context()
				token, err := authService.ExchangeCode(ctx, code)
				if err != nil {
					return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
						"error": "Failed to exchange authorization code",
					})
				}

				// Extract ID token from OAuth2 token
				rawIDToken, ok := token.Extra("id_token").(string)
				if !ok {
					return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
						"error": "No ID token in response",
					})
				}

				// Verify ID token and get user info
				userInfo, err := authService.VerifyIDToken(ctx, rawIDToken)
				if err != nil {
					return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
						"error": "Invalid ID token",
					})
				}

				// Generate JWT session token
				sessionToken, err := authService.GenerateSessionToken(userInfo)
				if err != nil {
					return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
						"error": "Failed to create session",
					})
				}

				// Set JWT session token as secure cookie
				c.Cookie(&fiber.Cookie{
					Name:     cfg.Auth.OIDC.CookieName,
					Value:    sessionToken,
					MaxAge:   cfg.Auth.OIDC.SessionMaxAge,
					Secure:   cfg.Auth.OIDC.CookieSecure,
					HTTPOnly: cfg.Auth.OIDC.CookieHTTPOnly,
					SameSite: cfg.Auth.OIDC.CookieSameSite,
				})

				// Redirect to frontend with success indicator
				return c.Redirect().To("/login?login=success")
			})

			// Logout endpoint
			oidcRoutes.Post("/logout", func(c fiber.Ctx) error {
				// Clear session cookie
				c.Cookie(&fiber.Cookie{
					Name:   cfg.Auth.OIDC.CookieName,
					Value:  "",
					MaxAge: -1,
				})

				return c.JSON(fiber.Map{
					"success": true,
					"message": "Logged out successfully",
				})
			})
		}
	}

	cfg.Server.FrontendPath = "./frontend/dist"

	// Check if frontend path exists
	if _, err := os.Stat(cfg.Server.FrontendPath); err == nil {
		// SPA fallback - serve index.html for all non-API routes
		app.Use(func(c fiber.Ctx) error {
			path := c.Path()

			if strings.HasPrefix(path, "/api/") ||
				strings.HasPrefix(path, "/auth") ||
				strings.HasPrefix(path, "/health") ||
				strings.HasPrefix(path, "/docs") {
				logger.Debug().Str("path", path).Msg("API or health check route, skipping SPA fallback")
				return c.Next()
			}

			// Try to serve static files first
			filePath := filepath.Join(cfg.Server.FrontendPath, path)
			if info, err := os.Stat(filePath); err == nil && !info.IsDir() {
				return c.SendFile(filePath)
			}

			// If no static file exists, serve index.html for SPA routing
			indexPath := filepath.Join(cfg.Server.FrontendPath, "index.html")
			return c.SendFile(indexPath)
		})
	}
}
