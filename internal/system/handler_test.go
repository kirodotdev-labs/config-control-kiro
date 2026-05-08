package system

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"kiromanager/internal/shared/utils"
)

func newTestHandler(t *testing.T) *Handler {
	t.Helper()
	svc := NewKiroService(utils.NewLogger(), "test")
	return NewHandler(svc)
}

func TestHandler_GetSystemInfo(t *testing.T) {
	h := newTestHandler(t)
	req := httptest.NewRequest("GET", "/api/system/info", nil)
	w := httptest.NewRecorder()

	h.GetSystemInfo(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	var result map[string]interface{}
	json.NewDecoder(w.Body).Decode(&result)
	if result["platform"] == nil {
		t.Error("expected platform in response")
	}
}

func TestHandler_GetKiroStatus(t *testing.T) {
	h := newTestHandler(t)
	req := httptest.NewRequest("GET", "/api/kiro/status", nil)
	w := httptest.NewRecorder()

	h.GetKiroStatus(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestHandler_GetKiroModels(t *testing.T) {
	h := newTestHandler(t)
	req := httptest.NewRequest("GET", "/api/system/models", nil)
	w := httptest.NewRecorder()

	h.GetKiroModels(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestHandler_GetWorkspaceContext(t *testing.T) {
	h := newTestHandler(t)
	req := httptest.NewRequest("GET", "/api/workspace/context", nil)
	w := httptest.NewRecorder()

	h.GetWorkspaceContext(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	var result map[string]interface{}
	json.NewDecoder(w.Body).Decode(&result)
	if result["mode"] != "global" {
		t.Errorf("expected mode 'global', got %v", result["mode"])
	}
}

func TestHandler_SetWorkspaceContext(t *testing.T) {
	h := newTestHandler(t)
	dir := t.TempDir()
	body := `{"mode":"workspace","path":"` + dir + `"}`
	req := httptest.NewRequest("POST", "/api/workspace/context", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	h.SetWorkspaceContext(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	var result map[string]interface{}
	json.NewDecoder(w.Body).Decode(&result)
	if result["mode"] != "workspace" {
		t.Errorf("expected mode 'workspace', got %v", result["mode"])
	}
}

func TestHandler_SetWorkspaceContext_InvalidJSON(t *testing.T) {
	h := newTestHandler(t)
	req := httptest.NewRequest("POST", "/api/workspace/context", strings.NewReader("not json"))
	w := httptest.NewRecorder()

	h.SetWorkspaceContext(w, req)

	if w.Code == http.StatusOK {
		t.Error("expected error for invalid JSON")
	}
}
