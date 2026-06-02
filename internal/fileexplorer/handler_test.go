package fileexplorer

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kiromanager/internal/shared/utils"
)

func newTestHandler() *Handler {
	return NewHandler(NewFileExplorerService(utils.NewLogger(), false))
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

func TestHandler_ReadFile_MissingPath(t *testing.T) {
	h := newTestHandler()
	req := httptest.NewRequest("GET", "/api/fileexplorer/read", nil)
	w := httptest.NewRecorder()

	h.ReadFile(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandler_CreateFolder(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "newfolder")

	h := newTestHandler()
	body := `{"path":"` + path + `"}`
	req := httptest.NewRequest("POST", "/api/fileexplorer/folder", strings.NewReader(body))
	w := httptest.NewRecorder()

	h.CreateFolder(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestHandler_CreateFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "new.txt")

	h := newTestHandler()
	body := `{"path":"` + path + `","content":"hello"}`
	req := httptest.NewRequest("POST", "/api/fileexplorer/file", strings.NewReader(body))
	w := httptest.NewRecorder()

	h.CreateFile(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestHandler_Delete(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "del.txt")
	os.WriteFile(path, []byte(""), 0644)

	h := newTestHandler()
	body := `{"path":"` + path + `"}`
	req := httptest.NewRequest("DELETE", "/api/fileexplorer/delete", strings.NewReader(body))
	w := httptest.NewRecorder()

	h.Delete(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestHandler_GenerateUniqueName(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "file.txt"), []byte(""), 0644)

	h := newTestHandler()
	req := httptest.NewRequest("GET", "/api/fileexplorer/unique-name?basePath="+dir+"&name=file.txt", nil)
	w := httptest.NewRecorder()

	h.GenerateUniqueName(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestHandler_GenerateUniqueName_MissingParams(t *testing.T) {
	h := newTestHandler()
	req := httptest.NewRequest("GET", "/api/fileexplorer/unique-name", nil)
	w := httptest.NewRecorder()

	h.GenerateUniqueName(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandler_PathTraversal(t *testing.T) {
	h := newTestHandler()

	traversalPaths := []string{
		"/tmp/../etc/passwd",
		"../../etc/passwd",
		"/home/user/../../etc/shadow",
		"..%2F..%2Fetc%2Fpasswd",
	}

	for _, tp := range traversalPaths {
		t.Run("Browse_"+tp, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/fileexplorer/browse?path="+tp, nil)
			w := httptest.NewRecorder()
			h.Browse(w, req)
			if w.Code != http.StatusBadRequest {
				t.Errorf("expected 400 for path %q, got %d", tp, w.Code)
			}
		})

		t.Run("ReadFile_"+tp, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/fileexplorer/read?path="+tp, nil)
			w := httptest.NewRecorder()
			h.ReadFile(w, req)
			if w.Code != http.StatusBadRequest {
				t.Errorf("expected 400 for path %q, got %d", tp, w.Code)
			}
		})
	}

	// POST endpoints with traversal in body
	for _, tp := range traversalPaths {
		t.Run("CreateFolder_"+tp, func(t *testing.T) {
			body := strings.NewReader(`{"path":"` + tp + `"}`)
			req := httptest.NewRequest("POST", "/api/fileexplorer/folder", body)
			w := httptest.NewRecorder()
			h.CreateFolder(w, req)
			if w.Code != http.StatusBadRequest {
				t.Errorf("expected 400 for path %q, got %d", tp, w.Code)
			}
		})

		t.Run("Delete_"+tp, func(t *testing.T) {
			body := strings.NewReader(`{"path":"` + tp + `"}`)
			req := httptest.NewRequest("POST", "/api/fileexplorer/delete", body)
			w := httptest.NewRecorder()
			h.Delete(w, req)
			if w.Code != http.StatusBadRequest {
				t.Errorf("expected 400 for path %q, got %d", tp, w.Code)
			}
		})
	}
}


func TestHandler_ResolvePath(t *testing.T) {
	dir := t.TempDir()
	filePath := filepath.Join(dir, "ok.txt")
	os.WriteFile(filePath, []byte("hi"), 0644)

	t.Run("valid directory", func(t *testing.T) {
		h := newTestHandler()
		body := strings.NewReader(`{"path":"` + dir + `"}`)
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
		body := strings.NewReader(`{"path":"` + filePath + `"}`)
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
