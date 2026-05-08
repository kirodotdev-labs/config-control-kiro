package steering

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

func newTestHandler(t *testing.T) *Handler {
	t.Helper()
	dir := t.TempDir()
	logger := utils.NewLogger()
	kiroSvc := system.NewKiroService(logger, "test")
	kiroSvc.SetWorkspace(dir)
	os.MkdirAll(filepath.Join(dir, ".kiro", "steering"), 0755)
	svc := NewService(kiroSvc, logger)
	return NewHandler(svc)
}

func TestHandler_GetFiles(t *testing.T) {
	h := newTestHandler(t)
	req := httptest.NewRequest("GET", "/api/steering/files", nil)
	w := httptest.NewRecorder()

	h.GetFiles(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestHandler_SaveAndGetContent(t *testing.T) {
	h := newTestHandler(t)

	// Save
	body := `{"filename":"test.md","content":"# Test"}`
	req := httptest.NewRequest("POST", "/api/steering/file", strings.NewReader(body))
	w := httptest.NewRecorder()
	h.SaveFile(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("save: expected 200, got %d", w.Code)
	}

	// Get content
	req = httptest.NewRequest("GET", "/api/steering/content?file=test.md", nil)
	w = httptest.NewRecorder()
	h.GetFileContent(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("get: expected 200, got %d", w.Code)
	}
	var result map[string]interface{}
	json.NewDecoder(w.Body).Decode(&result)
	if result["content"] != "# Test" {
		t.Errorf("expected '# Test', got %v", result["content"])
	}
}

func TestHandler_GetFileContent_MissingParam(t *testing.T) {
	h := newTestHandler(t)
	req := httptest.NewRequest("GET", "/api/steering/content", nil)
	w := httptest.NewRecorder()

	h.GetFileContent(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandler_DeleteFile_MissingParam(t *testing.T) {
	h := newTestHandler(t)
	req := httptest.NewRequest("DELETE", "/api/steering/file", nil)
	w := httptest.NewRecorder()

	h.DeleteFile(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestHandler_FilenameTraversal(t *testing.T) {
	h := newTestHandler(t)

	malicious := []string{
		"../../etc/passwd",
		"../../../.ssh/id_rsa",
		"test/../../etc/shadow",
		"..\\windows\\system32\\config",
	}

	for _, name := range malicious {
		t.Run("GetContent_"+name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/steering/content?file="+name, nil)
			w := httptest.NewRecorder()
			h.GetFileContent(w, req)
			if w.Code != http.StatusBadRequest {
				t.Errorf("expected 400 for filename %q, got %d", name, w.Code)
			}
		})

		t.Run("SaveFile_"+name, func(t *testing.T) {
			payload, _ := json.Marshal(map[string]string{"filename": name, "content": "evil"})
			req := httptest.NewRequest("POST", "/api/steering/file", strings.NewReader(string(payload)))
			w := httptest.NewRecorder()
			h.SaveFile(w, req)
			if w.Code != http.StatusBadRequest {
				t.Errorf("expected 400 for filename %q, got %d", name, w.Code)
			}
		})

		t.Run("DeleteFile_"+name, func(t *testing.T) {
			req := httptest.NewRequest("DELETE", "/api/steering/file?file="+name, nil)
			w := httptest.NewRecorder()
			h.DeleteFile(w, req)
			if w.Code != http.StatusBadRequest {
				t.Errorf("expected 400 for filename %q, got %d", name, w.Code)
			}
		})
	}
}

func TestValidateFilename(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{"valid md file", "coding-standards.md", false},
		{"valid txt file", "notes.txt", false},
		{"traversal", "../../etc/passwd", true},
		{"forward slash", "sub/file.md", true},
		{"backslash", "sub\\file.md", true},
		{"double dot", "..secret", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateFilename(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateFilename(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
			}
		})
	}
}
