package steering

import (
	"os"
	"path/filepath"
	"testing"

	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

func setupTestService(t *testing.T) (*Service, string) {
	t.Helper()
	dir := t.TempDir()
	logger := utils.NewLogger()
	kiroSvc := system.NewKiroService(logger, "test")
	kiroSvc.SetWorkspace(dir)
	os.MkdirAll(filepath.Join(dir, ".kiro", "steering"), 0755)
	return NewService(kiroSvc, logger), dir
}

func TestGetFiles_Empty(t *testing.T) {
	svc, _ := setupTestService(t)
	files, err := svc.GetFiles()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(files) != 0 {
		t.Errorf("expected 0 files, got %d", len(files))
	}
}

func TestSaveAndGetFileContent(t *testing.T) {
	svc, _ := setupTestService(t)

	if err := svc.SaveFile("test.md", "# Hello"); err != nil {
		t.Fatalf("save failed: %v", err)
	}

	content, err := svc.GetFileContent("test.md")
	if err != nil {
		t.Fatalf("read failed: %v", err)
	}
	if content != "# Hello" {
		t.Errorf("expected '# Hello', got %q", content)
	}
}

func TestSaveFile_RequiresMdExtension(t *testing.T) {
	svc, _ := setupTestService(t)
	err := svc.SaveFile("test.txt", "content")
	if err == nil {
		t.Error("expected error for non-.md file")
	}
}

func TestDeleteFile(t *testing.T) {
	svc, _ := setupTestService(t)
	svc.SaveFile("delete-me.md", "content")

	if err := svc.DeleteFile("delete-me.md"); err != nil {
		t.Fatalf("delete failed: %v", err)
	}

	files, _ := svc.GetFiles()
	if len(files) != 0 {
		t.Errorf("expected 0 files after delete, got %d", len(files))
	}
}

func TestGetFiles_ListsMdOnly(t *testing.T) {
	svc, dir := setupTestService(t)
	steeringPath := filepath.Join(dir, ".kiro", "steering")
	os.WriteFile(filepath.Join(steeringPath, "a.md"), []byte("a"), 0644)
	os.WriteFile(filepath.Join(steeringPath, "b.md"), []byte("b"), 0644)
	os.WriteFile(filepath.Join(steeringPath, "c.txt"), []byte("c"), 0644)

	files, err := svc.GetFiles()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(files) != 2 {
		t.Errorf("expected 2 .md files, got %d", len(files))
	}
}
