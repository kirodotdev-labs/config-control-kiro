package mcp

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

func newTestHandler(t *testing.T) (*Handler, string) {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("KIRO_HOME", t.TempDir()) // never write the real ~/.kiro
	logger := utils.NewLogger()
	kiroSvc := system.NewKiroService(logger, "test")
	kiroSvc.SetWorkspace(dir)
	os.MkdirAll(filepath.Join(dir, ".kiro", "settings"), 0755)
	svc := NewMCPService(kiroSvc, logger)
	return NewHandler(svc), dir
}

func TestHandler_GetMCPConfig(t *testing.T) {
	h, _ := newTestHandler(t)
	req := httptest.NewRequest("GET", "/api/mcp/config", nil)
	w := httptest.NewRecorder()

	h.GetMCPConfig(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestHandler_SaveMCPConfig(t *testing.T) {
	h, _ := newTestHandler(t)
	body := `{"config":{"mcpServers":{"test":{"command":"echo"}}}}`
	req := httptest.NewRequest("POST", "/api/mcp/config", strings.NewReader(body))
	w := httptest.NewRecorder()

	h.SaveMCPConfig(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}
