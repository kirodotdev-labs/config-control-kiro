package fileexplorer

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kiromanager/internal/shared/utils"
)

func newTestHandler() *Handler {
	return NewHandler(NewFileExplorerService(utils.NewLogger(), false, nil))
}

func TestHandler_Browse(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "test.txt"), []byte("hi"), 0644)

	h := newTestHandler()
	req := httptest.NewRequest("GET", "/api/fileexplorer/browse?path="+dir, nil)
	w := httptest.NewRecorder()

	h.Browse(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestHandler_Browse_MissingPath(t *testing.T) {
	h := newTestHandler()
	req := httptest.NewRequest("GET", "/api/fileexplorer/browse", nil)
	w := httptest.NewRecorder()

	h.Browse(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandler_ReadFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "read.txt")
	os.WriteFile(path, []byte("content"), 0644)

	h := newTestHandler()
	req := httptest.NewRequest("GET", "/api/fileexplorer/read?path="+path, nil)
	w := httptest.NewRecorder()

	h.ReadFile(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestHandler_ReadFile_Optional(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "cli.json")
	h := newTestHandler()
	for _, tc := range []struct {
		query string
		code  int
		body  string
	}{{"", http.StatusNotFound, "FILE_NOT_FOUND"}, {"&optional=1", http.StatusOK, `"exists":false`}} {
		w := httptest.NewRecorder()
		h.ReadFile(w, httptest.NewRequest("GET", "/api/fileexplorer/read?path="+missing+tc.query, nil))
		if w.Code != tc.code || !strings.Contains(w.Body.String(), tc.body) {
			t.Errorf("%q: %d %s", tc.query, w.Code, w.Body.String())
		}
	}
}

func TestHandler_ReadFile_MissingPath(t *testing.T) {
	h := newTestHandler()
	req := httptest.NewRequest("GET", "/api/fileexplorer/read", nil)
	w := httptest.NewRecorder()

	h.ReadFile(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandler_CreateFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "new.txt")

	h := newTestHandler()
	body := jsonBody(map[string]string{"path": path, "content": "hello"})
	req := httptest.NewRequest("POST", "/api/fileexplorer/file", strings.NewReader(body))
	w := httptest.NewRecorder()

	h.CreateFile(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestHandler_ResolvePath(t *testing.T) {
	dir := t.TempDir()
	filePath := filepath.Join(dir, "ok.txt")
	os.WriteFile(filePath, []byte("hi"), 0644)

	t.Run("valid directory", func(t *testing.T) {
		h := newTestHandler()
		body := strings.NewReader(jsonBody(map[string]string{"path": dir}))
		req := httptest.NewRequest("POST", "/api/fileexplorer/resolve-path", body)
		w := httptest.NewRecorder()

		h.ResolvePath(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected 200, got %d", w.Code)
		}
		if !strings.Contains(w.Body.String(), `"valid":true`) {
			t.Errorf("expected valid:true in response, got %s", w.Body.String())
		}
		if !strings.Contains(w.Body.String(), `"type":"directory"`) {
			t.Errorf("expected type:directory, got %s", w.Body.String())
		}
	})

	t.Run("valid file", func(t *testing.T) {
		h := newTestHandler()
		body := strings.NewReader(jsonBody(map[string]string{"path": filePath}))
		req := httptest.NewRequest("POST", "/api/fileexplorer/resolve-path", body)
		w := httptest.NewRecorder()

		h.ResolvePath(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected 200, got %d", w.Code)
		}
		if !strings.Contains(w.Body.String(), `"type":"file"`) {
			t.Errorf("expected type:file, got %s", w.Body.String())
		}
	})

	t.Run("invalid path returns 200 with error in body", func(t *testing.T) {
		h := newTestHandler()
		body := strings.NewReader(`{"path":"/no/such/path/xyz"}`)
		req := httptest.NewRequest("POST", "/api/fileexplorer/resolve-path", body)
		w := httptest.NewRecorder()

		h.ResolvePath(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected 200 (errors in body), got %d", w.Code)
		}
		if !strings.Contains(w.Body.String(), `"valid":false`) {
			t.Errorf("expected valid:false, got %s", w.Body.String())
		}
	})

	t.Run("malformed JSON returns 400", func(t *testing.T) {
		h := newTestHandler()
		body := strings.NewReader(`not json`)
		req := httptest.NewRequest("POST", "/api/fileexplorer/resolve-path", body)
		w := httptest.NewRecorder()

		h.ResolvePath(w, req)

		if w.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", w.Code)
		}
	})
}

// jsonBody encodes a request body, so Windows paths (with backslashes) stay valid JSON.
func jsonBody(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}
