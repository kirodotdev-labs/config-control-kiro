package fileexplorer

import (
	"os"
	"path/filepath"
	"testing"

	"kiromanager/internal/shared/utils"
)

func newTestService() *FileExplorerService {
	return NewFileExplorerService(utils.NewLogger(), false)
}

func TestBrowse(t *testing.T) {
	svc := newTestService()
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "file.txt"), []byte("hi"), 0644)
	os.Mkdir(filepath.Join(dir, "subdir"), 0755)

	result, err := svc.Browse(dir, []string{"*"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Files) != 1 {
		t.Errorf("expected 1 file, got %d", len(result.Files))
	}
	if len(result.Folders) != 1 {
		t.Errorf("expected 1 folder, got %d", len(result.Folders))
	}
}

func TestBrowse_HiddenFilesSkipped(t *testing.T) {
	svc := newTestService()
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, ".hidden"), []byte(""), 0644)
	os.WriteFile(filepath.Join(dir, "visible.txt"), []byte(""), 0644)

	result, err := svc.Browse(dir, []string{"*"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Files) != 1 {
		t.Errorf("expected 1 visible file, got %d", len(result.Files))
	}
}

func TestBrowse_Filter(t *testing.T) {
	svc := newTestService()
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "a.md"), []byte(""), 0644)
	os.WriteFile(filepath.Join(dir, "b.txt"), []byte(""), 0644)

	result, err := svc.Browse(dir, []string{".md"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Files) != 1 {
		t.Errorf("expected 1 .md file, got %d", len(result.Files))
	}
}

func TestCreateAndReadFile(t *testing.T) {
	svc := newTestService()
	dir := t.TempDir()
	path := filepath.Join(dir, "new.txt")

	if err := svc.CreateFile(path, "hello world"); err != nil {
		t.Fatalf("create failed: %v", err)
	}

	content, err := svc.ReadFile(path)
	if err != nil {
		t.Fatalf("read failed: %v", err)
	}
	if content != "hello world" {
		t.Errorf("expected 'hello world', got %q", content)
	}
}

func TestCreateFolder(t *testing.T) {
	svc := newTestService()
	dir := t.TempDir()
	path := filepath.Join(dir, "newfolder")

	if err := svc.CreateFolder(path); err != nil {
		t.Fatalf("create folder failed: %v", err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("folder not found: %v", err)
	}
	if !info.IsDir() {
		t.Error("expected directory")
	}
}

func TestCreateFolder_Duplicate(t *testing.T) {
	svc := newTestService()
	dir := t.TempDir()
	path := filepath.Join(dir, "existing")
	os.Mkdir(path, 0755)

	err := svc.CreateFolder(path)
	if err == nil {
		t.Error("expected error for duplicate folder")
	}
}

func TestRename(t *testing.T) {
	svc := newTestService()
	dir := t.TempDir()
	old := filepath.Join(dir, "old.txt")
	os.WriteFile(old, []byte("data"), 0644)

	if err := svc.Rename(old, "new.txt"); err != nil {
		t.Fatalf("rename failed: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "new.txt")); err != nil {
		t.Error("renamed file not found")
	}
}

func TestDelete(t *testing.T) {
	svc := newTestService()
	dir := t.TempDir()
	path := filepath.Join(dir, "delete-me.txt")
	os.WriteFile(path, []byte(""), 0644)

	if err := svc.Delete(path); err != nil {
		t.Fatalf("delete failed: %v", err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Error("file should not exist after delete")
	}
}

func TestCopy(t *testing.T) {
	svc := newTestService()
	dir := t.TempDir()
	src := filepath.Join(dir, "src.txt")
	dst := filepath.Join(dir, "dst.txt")
	os.WriteFile(src, []byte("content"), 0644)

	if err := svc.Copy(src, dst); err != nil {
		t.Fatalf("copy failed: %v", err)
	}
	data, _ := os.ReadFile(dst)
	if string(data) != "content" {
		t.Errorf("expected 'content', got %q", string(data))
	}
}

func TestCut(t *testing.T) {
	svc := newTestService()
	dir := t.TempDir()
	src := filepath.Join(dir, "src.txt")
	dst := filepath.Join(dir, "dst.txt")
	os.WriteFile(src, []byte("moved"), 0644)

	if err := svc.Cut(src, dst); err != nil {
		t.Fatalf("cut failed: %v", err)
	}
	if _, err := os.Stat(src); !os.IsNotExist(err) {
		t.Error("source should not exist after cut")
	}
	data, _ := os.ReadFile(dst)
	if string(data) != "moved" {
		t.Errorf("expected 'moved', got %q", string(data))
	}
}

func TestBulkDelete(t *testing.T) {
	svc := newTestService()
	dir := t.TempDir()
	f1 := filepath.Join(dir, "a.txt")
	f2 := filepath.Join(dir, "b.txt")
	os.WriteFile(f1, []byte(""), 0644)
	os.WriteFile(f2, []byte(""), 0644)

	resp := svc.BulkDelete([]string{f1, f2})
	if len(resp.Success) != 2 {
		t.Errorf("expected 2 successes, got %d", len(resp.Success))
	}
	if len(resp.Failed) != 0 {
		t.Errorf("expected 0 failures, got %d", len(resp.Failed))
	}
}

func TestGenerateUniqueName(t *testing.T) {
	svc := newTestService()
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "file.txt"), []byte(""), 0644)

	name := svc.GenerateUniqueName(dir, "file.txt")
	if name != "file (1).txt" {
		t.Errorf("expected 'file (1).txt', got %q", name)
	}
}

func TestCheckConflicts(t *testing.T) {
	svc := newTestService()
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "exists.txt"), []byte(""), 0644)

	src := filepath.Join(t.TempDir(), "exists.txt")
	os.WriteFile(src, []byte(""), 0644)

	conflicts := svc.CheckConflicts([]string{src}, dir)
	if len(conflicts) != 1 {
		t.Errorf("expected 1 conflict, got %d", len(conflicts))
	}
}


func TestResolvePathService(t *testing.T) {
	svc := newTestService()
	dir := t.TempDir()
	filePath := filepath.Join(dir, "x.txt")
	os.WriteFile(filePath, []byte("hello"), 0644)

	t.Run("valid directory", func(t *testing.T) {
		res := svc.ResolvePath(dir)
		if !res.Valid {
			t.Fatalf("expected valid, got %s", res.Error)
		}
		if res.Type != "directory" {
			t.Errorf("expected directory, got %s", res.Type)
		}
	})

	t.Run("valid file", func(t *testing.T) {
		res := svc.ResolvePath(filePath)
		if !res.Valid {
			t.Fatalf("expected valid, got %s", res.Error)
		}
		if res.Type != "file" {
			t.Errorf("expected file, got %s", res.Type)
		}
		if res.ParentPath != dir {
			t.Errorf("expected parent=%s, got %s", dir, res.ParentPath)
		}
	})

	t.Run("invalid path returns error in body", func(t *testing.T) {
		res := svc.ResolvePath("/nonexistent/path/xyz")
		if res.Valid {
			t.Fatal("expected invalid")
		}
		if res.Error == "" {
			t.Fatal("expected error message")
		}
	})

	t.Run("traversal blocked", func(t *testing.T) {
		res := svc.ResolvePath("/tmp/../etc/passwd")
		if res.Valid {
			t.Fatal("expected invalid for traversal")
		}
	})
}
