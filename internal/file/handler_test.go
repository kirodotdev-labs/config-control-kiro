package file

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"kiromanager/internal/shared/utils"
)

func newTestHandler() *Handler {
	return NewHandler(NewFileService(utils.NewLogger()))
}

func TestHandler_BrowseFiles(t *testing.T) {
	h := newTestHandler()
	req := httptest.NewRequest("GET", "/api/files/browse?path="+t.TempDir(), nil)
	w := httptest.NewRecorder()

	h.BrowseFiles(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestHandler_GenerateFileURI(t *testing.T) {
	h := newTestHandler()
	body := `{"path":"/tmp/test.txt"}`
	req := httptest.NewRequest("POST", "/api/files/generate-uri", strings.NewReader(body))
	w := httptest.NewRecorder()

	h.GenerateFileURI(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestHandler_UploadFiles(t *testing.T) {
	h := newTestHandler()
	req := httptest.NewRequest("POST", "/api/files/upload", nil)
	w := httptest.NewRecorder()

	h.UploadFiles(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}
