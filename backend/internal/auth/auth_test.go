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
