package agent

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gorilla/mux"
	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

func newTestHandler(t *testing.T) (*Handler, string) {
	t.Helper()
	dir := t.TempDir()
	logger := utils.NewLogger()
	kiroSvc := system.NewKiroService(logger, "test")
	kiroSvc.SetWorkspace(dir)
	os.MkdirAll(filepath.Join(dir, ".kiro", "agents"), 0755)
	svc := NewAgentService(kiroSvc, logger)
	return NewHandler(svc), dir
}

func TestHandler_GetAgents_Empty(t *testing.T) {
	h, _ := newTestHandler(t)
	req := httptest.NewRequest("GET", "/api/agents", nil)
	w := httptest.NewRecorder()

	h.GetAgents(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestHandler_CreateAndGetAgent(t *testing.T) {
	h, _ := newTestHandler(t)

	// Create
	body := `{"name":"test-agent","description":"A test"}`
	req := httptest.NewRequest("POST", "/api/agents", strings.NewReader(body))
	w := httptest.NewRecorder()
	h.CreateAgent(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("create: expected 200, got %d: %s", w.Code, w.Body.String())
	}

	// Get all
	req = httptest.NewRequest("GET", "/api/agents", nil)
	w = httptest.NewRecorder()
	h.GetAgents(w, req)
	var agents []map[string]interface{}
	json.NewDecoder(w.Body).Decode(&agents)
	if len(agents) != 1 {
		t.Errorf("expected 1 agent, got %d", len(agents))
	}
}

func TestHandler_GetAllAgentNames(t *testing.T) {
	h, _ := newTestHandler(t)
	req := httptest.NewRequest("GET", "/api/agents/all-names", nil)
	w := httptest.NewRecorder()

	h.GetAllAgentNames(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestHandler_GetAgentConfig(t *testing.T) {
	h, _ := newTestHandler(t)
	req := httptest.NewRequest("GET", "/api/agents/config", nil)
	w := httptest.NewRecorder()

	h.GetAgentConfig(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestHandler_SaveAgentConfig(t *testing.T) {
	h, _ := newTestHandler(t)
	req := httptest.NewRequest("POST", "/api/agents/config", strings.NewReader(`{}`))
	w := httptest.NewRecorder()

	h.SaveAgentConfig(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestHandler_AgentNameTraversal(t *testing.T) {
	h, _ := newTestHandler(t)

	maliciousNames := []string{
		"../../etc/important",
		"../../../.ssh/authorized_keys",
		"test/../../etc/passwd",
	}

	for _, name := range maliciousNames {
		t.Run("GetAgent_"+name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/agents/"+name, nil)
			req = mux.SetURLVars(req, map[string]string{"name": name})
			w := httptest.NewRecorder()
			h.GetAgent(w, req)
			// SanitizeName strips /, \, and .. so the name becomes harmless
			// The agent won't exist, so we expect 404 not a file read outside agents dir
			if w.Code == http.StatusOK {
				t.Errorf("traversal name %q should not return 200", name)
			}
		})

		t.Run("DeleteAgent_"+name, func(t *testing.T) {
			req := httptest.NewRequest("DELETE", "/api/agents/"+name, nil)
			req = mux.SetURLVars(req, map[string]string{"name": name})
			w := httptest.NewRecorder()
			h.DeleteAgent(w, req)
			if w.Code == http.StatusOK {
				t.Errorf("traversal name %q should not return 200", name)
			}
		})
	}
}
