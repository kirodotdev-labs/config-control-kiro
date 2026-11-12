package memory

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGetMemories(t *testing.T) {
	svc, _ := newTestService(t)
	w := httptest.NewRecorder()
	NewHandler(svc, nil).GetMemories(w, httptest.NewRequest(http.MethodGet, "/api/memories", nil))
	var l List
	if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &l) != nil || l.Memories == nil {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}
