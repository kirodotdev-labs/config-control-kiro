package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

// realServer builds the production server against a temporary Kiro home.
func realServer(t *testing.T) http.Handler {
	t.Helper()
	t.Setenv("KIRO_HOME", t.TempDir())
	logger := utils.NewLogger()
	kiro := system.NewKiroService(logger, "test")
	h := NewHandlers(kiro, logger)
	srv, err := New(Config{Port: 0, Token: testToken, Logger: logger, Handlers: h,
		WebFS: fstest.MapFS{"index.html": {Data: []byte("<head></head>")}}})
	if err != nil {
		t.Fatal(err)
	}
	return srv.Handler
}

func TestEveryAPIRouteRequiresToken(t *testing.T) {
	h := realServer(t)
	for _, route := range []string{
		"GET /api/system/info", "GET /api/workspace/context", "GET /api/agents",
		"POST /api/agents", "DELETE /api/agents/x", "POST /api/mcp/config",
		"POST /api/fileexplorer/file", "DELETE /api/fileexplorer/file?path=x", "POST /api/fileexplorer/copy", "POST /api/skills/import", "GET /api/skills", "GET /api/workflows/runs", "POST /api/powers/install-github", "GET /api/powers/source", "POST /api/launcher/launch", "GET /api/memories", "GET /api/codeintel", "POST /api/memories", "PUT /api/memories/x", "DELETE /api/memories/x",
	} {
		method, path, _ := strings.Cut(route, " ")
		if w := do(h, method, path, ""); w.Code != http.StatusUnauthorized {
			t.Errorf("%s without token: %d, want 401", route, w.Code)
		}
	}
}

func TestRealRoutesRespond(t *testing.T) {
	h := realServer(t)
	auth := "Bearer " + testToken
	for _, path := range []string{"/api/system/info", "/api/workspace/context", "/api/agents", "/api/system/surfaces", "/api/permissions/meta", "/api/relations?id=mcp", "/api/memories"} {
		if w := do(h, "GET", path, auth); w.Code != http.StatusOK {
			t.Errorf("GET %s: %d %s", path, w.Code, w.Body.String())
		}
	}
	req := httptest.NewRequest("POST", "/api/fileexplorer/file", strings.NewReader("{bad json"))
	req.Header.Set("Authorization", auth)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("malformed JSON should be 400, got %d", w.Code)
	}
}
