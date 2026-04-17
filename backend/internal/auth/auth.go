package auth

import (
	"context"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"

	"Noooste/garage-ui/internal/config"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

// Service handles authentication operations
type Service struct {
	authConfig   *config.AuthConfig
	serverConfig *config.ServerConfig
	oidcProvider *oidc.Provider
	oidcVerifier *oidc.IDTokenVerifier
	oauth2Config *oauth2.Config
	jwtService   *JWTService
}

// UserInfo represents authenticated user information
type UserInfo struct {
	Username string
	Email    string
	Name     string
	Roles    []string
}

// NewAuthService creates a new authentication service
func NewAuthService(authCfg *config.AuthConfig, serverCfg *config.ServerConfig) (*Service, error) {
	jwtService, err := NewJWTServiceWithKey(authCfg.JWTPrivKey)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize JWT service: %w", err)
	}

	service := &Service{
		authConfig:   authCfg,
		serverConfig: serverCfg,
		jwtService:   jwtService,
	}

	// Initialize OIDC if enabled
	if authCfg.OIDC.Enabled {
		if err := service.initOIDC(); err != nil {
			return nil, fmt.Errorf("failed to initialize OIDC: %w", err)
		}
	}

	return service, nil
}

// initOIDC initializes the OIDC provider and configuration
func (a *Service) initOIDC() error {
	ctx := context.Background()

	// Create OIDC provider
	provider, err := oidc.NewProvider(ctx, a.authConfig.OIDC.IssuerURL)
	if err != nil {
		return fmt.Errorf("failed to create OIDC provider: %w", err)
	}

	a.oidcProvider = provider

	// Create ID token verifier
	verifierConfig := &oidc.Config{
		ClientID:        a.authConfig.OIDC.ClientID,
		SkipIssuerCheck: a.authConfig.OIDC.SkipIssuerCheck,
		SkipExpiryCheck: a.authConfig.OIDC.SkipExpiryCheck,
	}
	a.oidcVerifier = provider.Verifier(verifierConfig)

	// Construct redirect URL from server config
	// Use root_url if set, otherwise construct from protocol/domain
	redirectURL := a.serverConfig.RootURL + "/auth/oidc/callback"

	// Create OAuth2 config
	a.oauth2Config = &oauth2.Config{
		ClientID:     a.authConfig.OIDC.ClientID,
		ClientSecret: a.authConfig.OIDC.ClientSecret,
		RedirectURL:  redirectURL,
		Endpoint:     provider.Endpoint(),
		Scopes:       a.authConfig.OIDC.Scopes,
	}

	return nil
}

// ValidateBasicAuth validates basic authentication credentials
func (a *Service) ValidateBasicAuth(username, password string) bool {
	// Use constant-time comparison to prevent timing attacks
	usernameMatch := subtle.ConstantTimeCompare(
		[]byte(username),
		[]byte(a.authConfig.Admin.Username),
	) == 1

	passwordMatch := subtle.ConstantTimeCompare(
		[]byte(password),
		[]byte(a.authConfig.Admin.Password),
	) == 1

	return usernameMatch && passwordMatch
}

// ParseBasicAuth parses the Authorization header for basic auth
func ParseBasicAuth(authHeader string) (username, password string, ok bool) {
	if authHeader == "" {
		return "", "", false
	}

	// Check if it's a Basic auth header
	const prefix = "Basic "
	if !strings.HasPrefix(authHeader, prefix) {
		return "", "", false
	}

	// Decode base64 credentials
	encoded := authHeader[len(prefix):]
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", "", false
	}

	// Split username:password
	credentials := string(decoded)
	parts := strings.SplitN(credentials, ":", 2)
	if len(parts) != 2 {
		return "", "", false
	}

	return parts[0], parts[1], true
}

// GetAuthorizationURL returns the OIDC authorization URL for login
func (a *Service) GetAuthorizationURL(state string) (string, error) {
	if a.oauth2Config == nil {
		return "", fmt.Errorf("OIDC not initialized")
	}

	return a.oauth2Config.AuthCodeURL(state), nil
}

// ExchangeCode exchanges an authorization code for tokens
func (a *Service) ExchangeCode(ctx context.Context, code string) (*oauth2.Token, error) {
	if a.oauth2Config == nil {
		return nil, fmt.Errorf("OIDC not initialized")
	}

	token, err := a.oauth2Config.Exchange(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("failed to exchange code: %w", err)
	}

	return token, nil
}

// VerifyIDToken verifies an OIDC ID token and extracts user info
func (a *Service) VerifyIDToken(ctx context.Context, rawIDToken string) (*UserInfo, error) {
	if a.oidcVerifier == nil {
		return nil, fmt.Errorf("OIDC not initialized")
	}

	// Verify the ID token
	idToken, err := a.oidcVerifier.Verify(ctx, rawIDToken)
	if err != nil {
		return nil, fmt.Errorf("failed to verify ID token: %w", err)
	}

	// Extract claims
	var claims map[string]interface{}
	if err := idToken.Claims(&claims); err != nil {
		return nil, fmt.Errorf("failed to parse claims: %w", err)
	}

	// Extract user information using configured attributes
	userInfo := &UserInfo{
		Username: extractClaim(claims, a.authConfig.OIDC.UsernameAttribute),
		Email:    extractClaim(claims, a.authConfig.OIDC.EmailAttribute),
		Name:     extractClaim(claims, a.authConfig.OIDC.NameAttribute),
	}

	// Extract roles if configured
	if a.authConfig.OIDC.RoleAttributePath != "" {
		userInfo.Roles = extractRoles(claims, a.authConfig.OIDC.RoleAttributePath)
	}

	return userInfo, nil
}

// GetUserInfo retrieves user information from the OIDC provider
func (a *Service) GetUserInfo(ctx context.Context, token *oauth2.Token) (*UserInfo, error) {
	if a.oidcProvider == nil {
		return nil, fmt.Errorf("OIDC not initialized")
	}

	// Create OAuth2 token source
	tokenSource := a.oauth2Config.TokenSource(ctx, token)

	// Get user info from the provider
	userInfoEndpoint, err := a.oidcProvider.UserInfo(ctx, tokenSource)
	if err != nil {
		return nil, fmt.Errorf("failed to get user info: %w", err)
	}

	// Extract claims
	var claims map[string]interface{}
	if err := userInfoEndpoint.Claims(&claims); err != nil {
		return nil, fmt.Errorf("failed to parse user info claims: %w", err)
	}

	// Build user info
	userInfo := &UserInfo{
		Username: extractClaim(claims, a.authConfig.OIDC.UsernameAttribute),
		Email:    extractClaim(claims, a.authConfig.OIDC.EmailAttribute),
		Name:     extractClaim(claims, a.authConfig.OIDC.NameAttribute),
	}

	// Extract roles if configured
	if a.authConfig.OIDC.RoleAttributePath != "" {
		userInfo.Roles = extractRoles(claims, a.authConfig.OIDC.RoleAttributePath)
	}

	return userInfo, nil
}

// ExtractRolesFromAccessToken parses the access token JWT payload and extracts
// roles using the configured role_attribute_path. Keycloak emits resource_access
// claims only in the access token by default, so this is required to support
// the common Keycloak client-role setup without extra mapper configuration.
//
// The access token was obtained via a verified code exchange with the provider,
// so parsing its claims without re-verifying the signature is safe here.
func (a *Service) ExtractRolesFromAccessToken(accessToken string) []string {
	if accessToken == "" || a.authConfig.OIDC.RoleAttributePath == "" {
		return nil
	}

	parts := strings.Split(accessToken, ".")
	if len(parts) < 2 {
		return nil
	}

	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil
	}

	var claims map[string]interface{}
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil
	}

	return extractRoles(claims, a.authConfig.OIDC.RoleAttributePath)
}

// IsAdmin checks if the user has admin role
func (a *Service) IsAdmin(userInfo *UserInfo) bool {
	if a.authConfig.OIDC.AdminRole == "" {
		return false
	}

	for _, role := range userInfo.Roles {
		if role == a.authConfig.OIDC.AdminRole {
			return true
		}
	}

	return false
}

// Helper functions

// extractClaim extracts a string claim from the claims map
func extractClaim(claims map[string]interface{}, key string) string {
	if key == "" {
		return ""
	}

	value, ok := claims[key]
	if !ok {
		return ""
	}

	str, ok := value.(string)
	if !ok {
		return ""
	}

	return str
}

// extractRoles extracts roles from nested claim path (e.g., "resource_access.garage-ui.roles")
func extractRoles(claims map[string]interface{}, path string) []string {
	if path == "" {
		return nil
	}

	// Split the path by dots to navigate nested claims
	parts := strings.Split(path, ".")

	current := claims
	for i, part := range parts {
		value, ok := current[part]
		if !ok {
			return nil
		}

		if i == len(parts)-1 {
			return extractStringArray(value)
		}

		// Navigate to next level
		next, ok := value.(map[string]interface{})
		if !ok {
			return nil
		}
		current = next
	}

	return nil
}

// extractStringArray converts an interface{} to []string if possible
func extractStringArray(value interface{}) []string {
	// Try direct string array
	if strArray, ok := value.([]string); ok {
		return strArray
	}

	// Try interface array and convert to strings
	if array, ok := value.([]interface{}); ok {
		result := make([]string, 0, len(array))
		for _, item := range array {
			if str, ok := item.(string); ok {
				result = append(result, str)
			}
		}
		return result
	}

	return nil
}

// GenerateStateToken generates a secure CSRF state token
func (a *Service) GenerateStateToken() (string, error) {
	return a.jwtService.GenerateStateToken()
}

// ValidateAndConsumeState validates and consumes a CSRF state token
func (a *Service) ValidateAndConsumeState(token string) bool {
	return a.jwtService.ValidateAndConsumeState(token)
}

// GenerateSessionToken generates a JWT session token for the user.
//
// SessionMaxAge lives under the OIDC config block, but the JWT is shared with
// admin-only deployments that never set it. Treat a non-positive value as
// "not configured" and fall back to 24h so the token isn't issued already
// expired (which would make every subsequent request fail with 401).
func (a *Service) GenerateSessionToken(userInfo *UserInfo) (string, error) {
	maxAge := a.authConfig.OIDC.SessionMaxAge
	if maxAge <= 0 {
		maxAge = 86400
	}
	return a.jwtService.GenerateToken(userInfo, maxAge)
}

// ValidateSessionToken validates a JWT session token and returns user info
func (a *Service) ValidateSessionToken(tokenString string) (*UserInfo, error) {
	claims, err := a.jwtService.ValidateToken(tokenString)
	if err != nil {
		return nil, err
	}

	return &UserInfo{
		Username: claims.Username,
		Email:    claims.Email,
		Name:     claims.Name,
		Roles:    claims.Roles,
	}, nil
}
