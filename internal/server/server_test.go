package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"kiromanager/internal/shared/utils"
)

const testToken = "secret-token"

// testServer returns the root handler with a single fake API route.
func testServer(t *testing.T) http.Handler {
	t.Helper()
	webFS := fstest.MapFS{
		"index.html":    {Data: []byte("<html><head></head><body></body></html>")},
		"assets/app.js": {Data: []byte("console.log(1)")},
	}
	spa, err := spaHandler(webFS, testToken)
	if err != nil {
		t.Fatal(err)
	}
	api := http.NewServeMux()
	api.HandleFunc("GET /api/ping", func(w http.ResponseWriter, r *http.Request) { utils.RespondJSON(w, 200, "pong") })
	api.HandleFunc("GET /api/panic", func(w http.ResponseWriter, r *http.Request) { panic("boom") })
	logger := utils.NewLogger()
	root := http.NewServeMux()
	root.Handle("/api/", chain(api, recoverPanics(logger), securityHeaders, requireToken(testToken), limitBody))
	root.Handle("/", spa)
	return root
}

func do(h http.Handler, method, path, auth string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, nil)
	if auth != "" {
		req.Header.Set("Authorization", auth)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

func TestAPIAuth(t *testing.T) {
	h := testServer(t)
	tests := []struct {
		name, auth string
		status     int
	}{
		{"no token", "", http.StatusUnauthorized},
		{"wrong token", "Bearer nope", http.StatusUnauthorized},
		{"raw token without scheme", testToken, http.StatusUnauthorized},
		{"valid token", "Bearer " + testToken, http.StatusOK},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if w := do(h, "GET", "/api/ping", tt.auth); w.Code != tt.status {
				t.Errorf("status %d want %d", w.Code, tt.status)
			}
		})
	}
}

func TestAPIRouting(t *testing.T) {
	h := testServer(t)
	auth := "Bearer " + testToken
	if w := do(h, "POST", "/api/ping", auth); w.Code != http.StatusMethodNotAllowed {
		t.Errorf("wrong method: %d", w.Code)
	}
	if w := do(h, "GET", "/api/unknown", auth); w.Code != http.StatusNotFound {
		t.Errorf("unknown route: %d", w.Code)
	}
	if w := do(h, "GET", "/api/panic", auth); w.Code != http.StatusInternalServerError {
		t.Errorf("panic should become 500, got %d", w.Code)
	}
	if w := do(h, "GET", "/api/ping", auth); w.Header().Get("X-Frame-Options") != "DENY" {
		t.Error("security headers missing on API response")
	}
}

func TestSPA(t *testing.T) {
	h := testServer(t)
	w := do(h, "GET", "/", "")
	body := w.Body.String()
	csp := w.Header().Get("Content-Security-Policy")
	if w.Code != 200 || !strings.Contains(body, `window.__CCKIRO_TOKEN__="`+testToken+`"`) {
		t.Fatalf("index missing token: %d %s", w.Code, body)
	}
	if !strings.Contains(csp, "script-src 'self' 'nonce-") || !strings.Contains(body, `<script nonce="`) {
		t.Errorf("token script must be nonce-protected; csp=%q", csp)
	}
	if strings.Contains(csp, "unsafe-eval") || strings.Contains(csp, "script-src 'self' 'unsafe-inline'") {
		t.Errorf("CSP too permissive: %q", csp)
	}
	if w := do(h, "GET", "/assets/app.js", ""); w.Body.String() != "console.log(1)" {
		t.Errorf("asset not served: %q", w.Body.String())
	}
	if w := do(h, "POST", "/", ""); w.Code != http.StatusMethodNotAllowed {
		t.Errorf("non-GET page request: %d", w.Code)
	}
	if w := do(h, "GET", "/some/client/route", ""); !strings.Contains(w.Body.String(), "__CCKIRO_TOKEN__") {
		t.Error("unknown path should fall back to index.html")
	}
	first, second := do(h, "GET", "/", ""), do(h, "GET", "/", "")
	if first.Header().Get("Content-Security-Policy") == second.Header().Get("Content-Security-Policy") {
		t.Error("nonce must differ per response")
	}
}

func TestNewTokenAndFindPort(t *testing.T) {
	a, err := NewToken()
	if err != nil || len(a) != 64 {
		t.Fatalf("token %q err %v", a, err)
	}
	if b, _ := NewToken(); a == b {
		t.Error("tokens must be random")
	}
	if port, err := FindPort(39000); err != nil || port < 39000 {
		t.Errorf("FindPort: %d %v", port, err)
	}
}
