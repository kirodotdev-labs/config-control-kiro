package performance

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

func newTestHandler(t *testing.T) (*Handler, string) {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("HOME", dir)
	logger := utils.NewLogger()
	kiroSvc := system.NewKiroService(logger, "test")
	if err := os.MkdirAll(filepath.Join(dir, ".kiro", "sessions", "cli"), 0755); err != nil {
		t.Fatalf("mkdir sessions: %v", err)
	}
	svc := NewService(kiroSvc, logger)
	return NewHandler(svc), dir
}

func TestHandler_GetSummary_EmptyReturns200(t *testing.T) {
	h, _ := newTestHandler(t)
	req := httptest.NewRequest("GET", "/api/performance/summary", nil)
	w := httptest.NewRecorder()

	h.GetSummary(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var body Summary
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Sessions != 0 || body.Prompts != 0 {
		t.Errorf("expected empty summary, got %+v", body)
	}
}

func TestHandler_GetSummary_WithData(t *testing.T) {
	h, home := newTestHandler(t)
	now := time.Now().Unix()
	writeSession(t, home, "sess", []map[string]interface{}{
		promptRecord(now-30, "hello"),
		assistantRecord("claude-opus-4.7", 1),
	})

	req := httptest.NewRequest("GET", "/api/performance/summary?window=24h", nil)
	w := httptest.NewRecorder()
	h.GetSummary(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var body Summary
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Prompts != 1 || body.AssistantMessages != 1 || body.ToolCalls != 1 {
		t.Errorf("unexpected counts: %+v", body)
	}
	if len(body.Models) != 1 || body.Models[0].ModelID != "claude-opus-4.7" {
		t.Errorf("unexpected models: %+v", body.Models)
	}
}

func TestHandler_GetRecent_ReturnsTurns(t *testing.T) {
	h, home := newTestHandler(t)
	now := time.Now().Unix()
	writeSession(t, home, "sess", []map[string]interface{}{
		promptRecord(now-30, "hello"),
		assistantRecord("claude-opus-4.7", 0),
	})

	req := httptest.NewRequest("GET", "/api/performance/recent?window=24h&limit=10", nil)
	w := httptest.NewRecorder()
	h.GetRecent(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var body struct {
		Turns []Turn `json:"turns"`
	}
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(body.Turns) != 1 {
		t.Fatalf("want 1 turn, got %d", len(body.Turns))
	}
	if body.Turns[0].Model != "claude-opus-4.7" || body.Turns[0].Preview != "hello" {
		t.Errorf("unexpected turn: %+v", body.Turns[0])
	}
}

func TestHandler_GetRecent_InvalidLimit(t *testing.T) {
	h, _ := newTestHandler(t)
	for _, bad := range []string{"0", "-1", "abc", "9999"} {
		req := httptest.NewRequest("GET", "/api/performance/recent?limit="+bad, nil)
		w := httptest.NewRecorder()
		h.GetRecent(w, req)
		if w.Code != http.StatusBadRequest {
			t.Errorf("limit=%q: expected 400, got %d", bad, w.Code)
		}
	}
}
