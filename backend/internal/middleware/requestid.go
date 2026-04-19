package middleware

import (
	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
)

// RequestIDHeader is the HTTP header used to read an incoming request ID
// (for cross-service correlation) and to echo the request ID in the response.
const RequestIDHeader = "X-Request-ID"

// RequestIDLocalsKey is the fiber.Ctx.Locals key carrying the request ID.
const RequestIDLocalsKey = "request_id"

// RequestID returns middleware that assigns a request ID to every request.
// If the client sends X-Request-ID, that value is used; otherwise a new
// UUIDv4 is generated. The ID is stored on c.Locals and echoed in the
// response header so clients and downstream services can correlate logs.
func RequestID() fiber.Handler {
	return func(c fiber.Ctx) error {
		id := c.Get(RequestIDHeader)
		if id == "" {
			id = uuid.NewString()
		}
		c.Locals(RequestIDLocalsKey, id)
		c.Set(RequestIDHeader, id)
		return c.Next()
	}
}
