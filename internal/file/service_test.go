package file

import (
	"os"
	"path/filepath"
	"testing"

	"kiromanager/internal/shared/utils"
)

func newTestService() *FileService {
	return NewFileService(utils.NewLogger())
}

func TestBrowseFiles_HomeDir(t *testing.T) {
	svc := newTestService()
	contents, err := svc.BrowseFiles("")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	home, _ := os.UserHomeDir()
	if contents.CurrentPath != home {
		t.Errorf("expected %q, got %q", home, contents.CurrentPath)
	}
}

func TestBrowseFiles_TempDir(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "test.txt"), []byte("hello"), 0644)
	os.Mkdir(filepath.Join(dir, "subdir"), 0755)

	svc := newTestService()
	contents, err := svc.BrowseFiles(dir)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(contents.Items) != 2 {
		t.Errorf("expected 2 items, got %d", len(contents.Items))
	}
}

func TestBrowseFiles_InvalidPath(t *testing.T) {
	svc := newTestService()
	_, err := svc.BrowseFiles("/nonexistent/path/xyz")
	if err == nil {
		t.Error("expected error for nonexistent path")
	}
}

func TestGenerateFileURI(t *testing.T) {
	svc := newTestService()
	uri := svc.GenerateFileURI("/home/user/file.txt")
	if uri != "file:///home/user/file.txt" {
		t.Errorf("expected 'file:///home/user/file.txt', got %q", uri)
	}
}

func TestBrowseFiles_Tilde(t *testing.T) {
	svc := newTestService()
	contents, err := svc.BrowseFiles("~")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	home, _ := os.UserHomeDir()
	if contents.CurrentPath != home {
		t.Errorf("expected %q, got %q", home, contents.CurrentPath)
	}
}
