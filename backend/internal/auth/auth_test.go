package auth

import (
	"encoding/base64"
	"encoding/json"
	"testing"

	"Noooste/garage-ui/internal/config"
)

func TestExtractRolesFromAccessToken_Keycloak(t *testing.T) {
	payload := map[string]interface{}{
		"resource_access": map[string]interface{}{
			"GarageAdminUi": map[string]interface{}{
				"roles": []interface{}{"admin"},
			},
			"account": map[string]interface{}{
				"roles": []interface{}{"view-profile"},
			},
		},
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	token := "header." + base64.RawURLEncoding.EncodeToString(raw) + ".sig"

	svc := &Service{
		authConfig: &config.AuthConfig{
			OIDC: config.OIDCConfig{
				RoleAttributePath: "resource_access.GarageAdminUi.roles",
			},
		},
	}

	roles := svc.ExtractRolesFromAccessToken(token)
	if len(roles) != 1 || roles[0] != "admin" {
		t.Fatalf("expected [admin], got %v", roles)
	}
}

func TestExtractRolesFromAccessToken_NoRoleClaim(t *testing.T) {
	payload := map[string]interface{}{"sub": "user"}
	raw, _ := json.Marshal(payload)
	token := "header." + base64.RawURLEncoding.EncodeToString(raw) + ".sig"

	svc := &Service{
		authConfig: &config.AuthConfig{
			OIDC: config.OIDCConfig{RoleAttributePath: "resource_access.GarageAdminUi.roles"},
		},
	}

	if roles := svc.ExtractRolesFromAccessToken(token); roles != nil {
		t.Fatalf("expected nil, got %v", roles)
	}
}

func TestExtractRolesFromAccessToken_Malformed(t *testing.T) {
	svc := &Service{
		authConfig: &config.AuthConfig{
			OIDC: config.OIDCConfig{RoleAttributePath: "resource_access.GarageAdminUi.roles"},
		},
	}
	if roles := svc.ExtractRolesFromAccessToken("not-a-jwt"); roles != nil {
		t.Fatalf("expected nil for malformed token, got %v", roles)
	}
	if roles := svc.ExtractRolesFromAccessToken(""); roles != nil {
		t.Fatalf("expected nil for empty token, got %v", roles)
	}
}

// Regression for issue #16: admin-only deployments never set
// OIDC.SessionMaxAge, leaving it at 0. Before the fix, that produced a JWT
// whose exp == iat, so every request after /auth/login was rejected as
// expired and the client saw UNAUTHORIZED.
func TestGenerateSessionToken_ZeroSessionMaxAge_IsNotImmediatelyExpired(t *testing.T) {
	jwtSvc, err := NewJWTService()
	if err != nil {
		t.Fatalf("NewJWTService: %v", err)
	}

	svc := &Service{
		authConfig: &config.AuthConfig{
			Admin: config.AdminAuthConfig{Enabled: true, Username: "admin", Password: "pw"},
			// OIDC disabled; SessionMaxAge left at zero value.
		},
		jwtService: jwtSvc,
	}

	token, err := svc.GenerateSessionToken(&UserInfo{Username: "admin"})
	if err != nil {
		t.Fatalf("GenerateSessionToken: %v", err)
	}

	if _, err := svc.ValidateSessionToken(token); err != nil {
		t.Fatalf("freshly issued admin session token failed validation: %v", err)
	}
}
