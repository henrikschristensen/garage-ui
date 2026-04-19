package middleware

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"Noooste/garage-ui/internal/auth"
	"Noooste/garage-ui/internal/config"
	logpkg "Noooste/garage-ui/pkg/logger"

	"github.com/gofiber/fiber/v3"
	"github.com/rs/zerolog"
)

// newAuthTestApp builds a fiber.App with RequestID + Logging (buffer-backed) +
// AuthMiddleware + a trivial /protected handler that echoes username/auth
// method into the JSON body so tests can assert on locals.
func newAuthTestApp(t *testing.T, buf *bytes.Buffer, authCfg *config.AuthConfig, svc *auth.Service) *fiber.App {
	t.Helper()
	base := zerolog.New(buf)
	app := fiber.New()
	app.Use(RequestID())
	app.Use(Logging(base))
	app.Use(AuthMiddleware(authCfg, svc))
	app.Get("/protected", func(c fiber.Ctx) error {
		uname, _ := c.Locals("username").(string)
		email, _ := c.Locals("email").(string)
		logpkg.FromCtx(c.Context()).Info().Msg("in_handler")
		return c.JSON(fiber.Map{
			"ok":       true,
			"username": uname,
			"email":    email,
		})
	})
	return app
}

// newAuthSvc returns an *auth.Service with the given auth config, JWT
// service initialized, OIDC disabled unless the caller wires it.
func newAuthSvc(t *testing.T, authCfg *config.AuthConfig) *auth.Service {
	t.Helper()
	svc, err := auth.NewAuthService(authCfg, &config.ServerConfig{})
	if err != nil {
		t.Fatalf("NewAuthService: %v", err)
	}
	return svc
}

// findLine returns the first parsed log line whose "message" field equals msg,
// failing the test if no such line is present.
func findLine(t *testing.T, buf *bytes.Buffer, msg string) map[string]any {
	t.Helper()
	for _, line := range parseLines(t, buf) {
		if line["message"] == msg {
			return line
		}
	}
	t.Fatalf("no %q log line: %s", msg, buf.String())
	return nil
}

func TestAuthMiddleware_BothDisabled_AllowsRequest(t *testing.T) {
	authCfg := &config.AuthConfig{
		Admin: config.AdminAuthConfig{Enabled: false},
		OIDC:  config.OIDCConfig{Enabled: false},
	}
	svc := newAuthSvc(t, authCfg)

	var buf bytes.Buffer
	app := newAuthTestApp(t, &buf, authCfg, svc)

	req := httptest.NewRequest("GET", "/protected", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var body map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["ok"] != true {
		t.Errorf("ok = %v, want true", body["ok"])
	}
	if body["username"] != "" {
		t.Errorf("username should be empty when auth disabled, got %q", body["username"])
	}
}

func newAdminCfg() *config.AuthConfig {
	return &config.AuthConfig{
		Admin: config.AdminAuthConfig{Enabled: true, Username: "admin", Password: "pw"},
		OIDC:  config.OIDCConfig{Enabled: false},
	}
}

func TestAuthMiddleware_Admin_BearerValid_AllowsAndEnrichesLogger(t *testing.T) {
	authCfg := newAdminCfg()
	svc := newAuthSvc(t, authCfg)
	tok, err := svc.GenerateSessionToken(&auth.UserInfo{Username: "admin", Email: "a@b"})
	if err != nil {
		t.Fatalf("GenerateSessionToken: %v", err)
	}

	var buf bytes.Buffer
	app := newAuthTestApp(t, &buf, authCfg, svc)

	req := httptest.NewRequest("GET", "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var body map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&body)
	if body["username"] != "admin" {
		t.Errorf("username = %v, want admin", body["username"])
	}
	if body["email"] != "a@b" {
		t.Errorf("email = %v, want a@b", body["email"])
	}

	// Enriched handler log line should carry user_id and auth_method=admin.
	access := findLine(t, &buf, "in_handler")
	if access["user_id"] != "admin" {
		t.Errorf("user_id = %v, want admin", access["user_id"])
	}
	if access["auth_method"] != "admin" {
		t.Errorf("auth_method = %v, want admin", access["auth_method"])
	}
}

func TestAuthMiddleware_Admin_BearerInvalid_Returns401(t *testing.T) {
	authCfg := newAdminCfg()
	svc := newAuthSvc(t, authCfg)

	var buf bytes.Buffer
	app := newAuthTestApp(t, &buf, authCfg, svc)

	req := httptest.NewRequest("GET", "/protected", nil)
	req.Header.Set("Authorization", "Bearer not-a-real-token")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if resp.StatusCode != 401 {
		t.Fatalf("status = %d, want 401", resp.StatusCode)
	}
	var env struct {
		Success bool `json:"success"`
		Error   struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&env)
	if env.Success {
		t.Error("success should be false")
	}
	if env.Error.Code != "UNAUTHORIZED" {
		t.Errorf("error.code = %q, want UNAUTHORIZED", env.Error.Code)
	}

	// Warn log should carry reason=no_valid_credentials without leaking the token.
	warn := findLine(t, &buf, "authentication_failed")
	if warn["reason"] != "no_valid_credentials" {
		t.Errorf("reason = %v", warn["reason"])
	}
	if warn["level"] != "warn" {
		t.Errorf("level = %v, want warn", warn["level"])
	}
	if strings.Contains(buf.String(), "not-a-real-token") {
		t.Error("token value must not appear in logs")
	}
}

func TestAuthMiddleware_Admin_NoAuthHeader_Returns401(t *testing.T) {
	authCfg := newAdminCfg()
	svc := newAuthSvc(t, authCfg)

	var buf bytes.Buffer
	app := newAuthTestApp(t, &buf, authCfg, svc)

	req := httptest.NewRequest("GET", "/protected", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if resp.StatusCode != 401 {
		t.Fatalf("status = %d, want 401", resp.StatusCode)
	}
}

func TestAuthMiddleware_Admin_NonBearerScheme_Returns401(t *testing.T) {
	authCfg := newAdminCfg()
	svc := newAuthSvc(t, authCfg)

	var buf bytes.Buffer
	app := newAuthTestApp(t, &buf, authCfg, svc)

	req := httptest.NewRequest("GET", "/protected", nil)
	req.Header.Set("Authorization", "Basic dXNlcjpwdw==")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if resp.StatusCode != 401 {
		t.Fatalf("status = %d, want 401", resp.StatusCode)
	}
}

func newOIDCCfg(cookieName string) *config.AuthConfig {
	return &config.AuthConfig{
		Admin: config.AdminAuthConfig{Enabled: false},
		OIDC: config.OIDCConfig{
			Enabled:    true,
			CookieName: cookieName,
		},
	}
}

// newOIDCSvc returns a Service whose OIDC is *not* initialized (no dialing
// needed), which is fine because AuthMiddleware's OIDC branch only calls
// ValidateSessionToken — a pure JWT operation.
func newOIDCSvc(t *testing.T) *auth.Service {
	t.Helper()
	return newAuthSvc(t, &config.AuthConfig{OIDC: config.OIDCConfig{Enabled: false}})
}

func TestAuthMiddleware_OIDC_ValidCookie_Allows(t *testing.T) {
	cfg := newOIDCCfg("session")
	svc := newOIDCSvc(t)

	tok, err := svc.GenerateSessionToken(&auth.UserInfo{Username: "alice", Email: "a@x"})
	if err != nil {
		t.Fatalf("GenerateSessionToken: %v", err)
	}

	var buf bytes.Buffer
	app := newAuthTestApp(t, &buf, cfg, svc)

	req := httptest.NewRequest("GET", "/protected", nil)
	req.AddCookie(&http.Cookie{Name: "session", Value: tok})
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	access := findLine(t, &buf, "in_handler")
	if access["auth_method"] != "oidc" {
		t.Errorf("auth_method = %v, want oidc", access["auth_method"])
	}
	if access["user_id"] != "alice" {
		t.Errorf("user_id = %v, want alice", access["user_id"])
	}
}

func TestAuthMiddleware_OIDC_InvalidCookie_Returns401(t *testing.T) {
	cfg := newOIDCCfg("session")
	svc := newOIDCSvc(t)

	var buf bytes.Buffer
	app := newAuthTestApp(t, &buf, cfg, svc)

	req := httptest.NewRequest("GET", "/protected", nil)
	req.AddCookie(&http.Cookie{Name: "session", Value: "garbage"})
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if resp.StatusCode != 401 {
		t.Fatalf("status = %d, want 401", resp.StatusCode)
	}
}

func TestAuthMiddleware_OIDC_NoCookie_Returns401(t *testing.T) {
	cfg := newOIDCCfg("session")
	svc := newOIDCSvc(t)

	var buf bytes.Buffer
	app := newAuthTestApp(t, &buf, cfg, svc)

	req := httptest.NewRequest("GET", "/protected", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if resp.StatusCode != 401 {
		t.Fatalf("status = %d, want 401", resp.StatusCode)
	}
}

func newBothCfg(cookieName string) *config.AuthConfig {
	return &config.AuthConfig{
		Admin: config.AdminAuthConfig{Enabled: true, Username: "admin", Password: "pw"},
		OIDC: config.OIDCConfig{
			Enabled:    true,
			CookieName: cookieName,
		},
	}
}

func TestAuthMiddleware_Both_BearerValid_AdminPathWins(t *testing.T) {
	cfg := newBothCfg("session")
	// OIDC disabled on the Service is fine — see Task 3 rationale.
	svc := newAuthSvc(t, &config.AuthConfig{Admin: cfg.Admin})

	tok, err := svc.GenerateSessionToken(&auth.UserInfo{Username: "admin"})
	if err != nil {
		t.Fatalf("GenerateSessionToken: %v", err)
	}

	var buf bytes.Buffer
	app := newAuthTestApp(t, &buf, cfg, svc)

	req := httptest.NewRequest("GET", "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	// Also set a valid OIDC cookie; admin should still win.
	cookieTok, _ := svc.GenerateSessionToken(&auth.UserInfo{Username: "alice"})
	req.AddCookie(&http.Cookie{Name: "session", Value: cookieTok})

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}

	access := findLine(t, &buf, "in_handler")
	if access["auth_method"] != "admin" {
		t.Errorf("auth_method = %v, want admin", access["auth_method"])
	}
	if access["user_id"] != "admin" {
		t.Errorf("user_id = %v, want admin", access["user_id"])
	}
}

func TestAuthMiddleware_Both_BearerInvalid_FallsThroughToOIDCCookie(t *testing.T) {
	cfg := newBothCfg("session")
	svc := newAuthSvc(t, &config.AuthConfig{Admin: cfg.Admin})

	cookieTok, err := svc.GenerateSessionToken(&auth.UserInfo{Username: "alice"})
	if err != nil {
		t.Fatalf("GenerateSessionToken: %v", err)
	}

	var buf bytes.Buffer
	app := newAuthTestApp(t, &buf, cfg, svc)

	req := httptest.NewRequest("GET", "/protected", nil)
	req.Header.Set("Authorization", "Bearer bogus")
	req.AddCookie(&http.Cookie{Name: "session", Value: cookieTok})

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("status = %d, want 200 (OIDC fallback)", resp.StatusCode)
	}

	access := findLine(t, &buf, "in_handler")
	if access["auth_method"] != "oidc" {
		t.Errorf("auth_method = %v, want oidc", access["auth_method"])
	}
}

func TestAuthMiddleware_Both_AllInvalid_Returns401WithCombinedMethodLabel(t *testing.T) {
	cfg := newBothCfg("session")
	svc := newAuthSvc(t, &config.AuthConfig{Admin: cfg.Admin})

	var buf bytes.Buffer
	app := newAuthTestApp(t, &buf, cfg, svc)

	req := httptest.NewRequest("GET", "/protected", nil)
	req.Header.Set("Authorization", "Bearer bogus")
	req.AddCookie(&http.Cookie{Name: "session", Value: "also-bogus"})

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	if resp.StatusCode != 401 {
		t.Fatalf("status = %d, want 401", resp.StatusCode)
	}

	warn := findLine(t, &buf, "authentication_failed")
	if warn["auth_method"] != "admin+oidc" {
		t.Errorf("auth_method = %v, want admin+oidc", warn["auth_method"])
	}
}
