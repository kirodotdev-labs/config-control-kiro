package fileexplorer

import (
	"errors"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

func newTestService() *FileExplorerService {
	return NewFileExplorerService(utils.NewLogger(), false, nil)
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

	if err := svc.CreateFile(path, "hello world", false); err != nil {
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

func TestCreateFileCreateOnly(t *testing.T) {
	svc := NewFileExplorerService(utils.NewLogger(), false, nil)
	path := filepath.Join(t.TempDir(), "nested", "a.md")
	if err := svc.CreateFile(path, "one", true); err != nil {
		t.Fatalf("create in new dir: %v", err)
	}
	if err := svc.CreateFile(path, "two", true); err == nil {
		t.Fatal("createOnly must refuse to overwrite")
	}
	if data, _ := os.ReadFile(path); string(data) != "one" {
		t.Errorf("file was overwritten: %q", data)
	}
}

func TestReadFileMissingIs404(t *testing.T) {
	svc := NewFileExplorerService(utils.NewLogger(), false, nil)
	_, err := svc.ReadFile(filepath.Join(t.TempDir(), "nope.json"))
	var appErr *utils.AppError
	if !errors.As(err, &appErr) || appErr.StatusCode != http.StatusNotFound {
		t.Fatalf("got %v", err)
	}
}

func TestDeleteStaysInsideDeletableRoots(t *testing.T) {
	home := t.TempDir()
	write := func(rel string) string {
		p := filepath.Join(home, rel)
		_ = os.MkdirAll(filepath.Dir(p), 0o755)
		_ = os.WriteFile(p, []byte("x"), 0o644)
		return p
	}
	roots := func() system.DeletableRoots {
		return system.DeletableRoots{
			Files:   []string{filepath.Join(home, "hooks"), filepath.Join(home, "skills"), filepath.Join(home, "specs")},
			Folders: []string{filepath.Join(home, "skills"), filepath.Join(home, "specs")},
		}
	}
	svc := NewFileExplorerService(utils.NewLogger(), false, roots)
	forbidden := func(err error) bool {
		var appErr *utils.AppError
		return errors.As(err, &appErr) && appErr.StatusCode == http.StatusForbidden
	}

	t.Run("a hook file is deleted", func(t *testing.T) {
		p := write("hooks/lint.json")
		if err := svc.Delete(p); err != nil {
			t.Fatal(err)
		}
		if _, err := os.Stat(p); !errors.Is(err, fs.ErrNotExist) {
			t.Error("file still there")
		}
	})
	t.Run("a skill folder is deleted with its contents", func(t *testing.T) {
		write("skills/review/SKILL.md")
		write("skills/review/scripts/run.sh")
		if err := svc.Delete(filepath.Join(home, "skills", "review")); err != nil {
			t.Fatal(err)
		}
		if _, err := os.Stat(filepath.Join(home, "skills", "review")); !errors.Is(err, fs.ErrNotExist) {
			t.Error("folder still there")
		}
	})
	t.Run("settings, stores and the roots themselves are refused", func(t *testing.T) {
		keep := []string{write("settings/permissions.yaml"), write("memories/memories.db"), write("agents/dev.json")}
		for _, p := range keep {
			if err := svc.Delete(p); !forbidden(err) {
				t.Errorf("%s: %v, want forbidden", p, err)
			}
			if _, err := os.Stat(p); err != nil {
				t.Errorf("%s was deleted", p)
			}
		}
		if err := svc.Delete(filepath.Join(home, "hooks")); !forbidden(err) {
			t.Errorf("deleting the hooks folder itself: %v", err)
		}
		_ = os.MkdirAll(filepath.Join(home, "specs", "a", "deep"), 0o755)
		if err := svc.Delete(filepath.Join(home, "specs", "a", "deep")); !forbidden(err) {
			t.Errorf("a nested folder is not a spec: %v", err)
		}
	})
	t.Run("missing is 404 and nil roots allow nothing", func(t *testing.T) {
		var appErr *utils.AppError
		if err := svc.Delete(filepath.Join(home, "hooks", "nope.json")); !errors.As(err, &appErr) || appErr.StatusCode != http.StatusNotFound {
			t.Errorf("missing: %v", err)
		}
		none := NewFileExplorerService(utils.NewLogger(), false, nil)
		if err := none.Delete(write("hooks/other.json")); !forbidden(err) {
			t.Errorf("nil roots: %v", err)
		}
	})
}

func TestCopyFileIntoKiroFolders(t *testing.T) {
	home, outside := t.TempDir(), t.TempDir()
	roots := func() system.DeletableRoots {
		return system.DeletableRoots{Files: []string{filepath.Join(home, "skills")}}
	}
	svc := NewFileExplorerService(utils.NewLogger(), false, roots)
	src := filepath.Join(outside, "check.sh")
	if err := os.WriteFile(src, []byte("#!/bin/sh\necho \x00ok\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	dest := filepath.Join(home, "skills", "pr", "scripts", "check.sh")
	status := func(err error) int {
		var appErr *utils.AppError
		if errors.As(err, &appErr) {
			return appErr.StatusCode
		}
		return 0
	}

	t.Run("copied byte for byte, still runnable", func(t *testing.T) {
		if err := svc.CopyFile(src, dest, false); err != nil {
			t.Fatal(err)
		}
		got, _ := os.ReadFile(dest)
		if string(got) != "#!/bin/sh\necho \x00ok\n" {
			t.Errorf("content: %q", got)
		}
		if info, _ := os.Stat(dest); runtime.GOOS != "windows" && info.Mode()&0o100 == 0 {
			t.Errorf("mode: %v", info.Mode())
		}
	})
	t.Run("an existing file is kept unless overwrite", func(t *testing.T) {
		if err := svc.CopyFile(src, dest, false); status(err) != http.StatusConflict {
			t.Errorf("want 409, got %v", err)
		}
		if err := svc.CopyFile(src, dest, true); err != nil {
			t.Errorf("overwrite: %v", err)
		}
	})
	t.Run("forward slashes from the app work too (Windows)", func(t *testing.T) {
		mixed := filepath.ToSlash(filepath.Join(home, "skills", "pr", "references")) + "/notes.sh"
		if err := svc.CopyFile(filepath.ToSlash(src), mixed, false); err != nil {
			t.Fatal(err)
		}
		if _, err := os.Stat(filepath.Join(home, "skills", "pr", "references", "notes.sh")); err != nil {
			t.Error(err)
		}
	})
	t.Run("only into the folders the UI manages", func(t *testing.T) {
		if err := svc.CopyFile(src, filepath.Join(outside, "elsewhere.sh"), false); status(err) != http.StatusForbidden {
			t.Errorf("want 403, got %v", err)
		}
	})
	t.Run("a folder or a missing file is refused", func(t *testing.T) {
		if err := svc.CopyFile(outside, filepath.Join(home, "skills", "pr", "x"), false); status(err) != http.StatusBadRequest {
			t.Errorf("folder: %v", err)
		}
		if err := svc.CopyFile(filepath.Join(outside, "nope"), filepath.Join(home, "skills", "pr", "y"), false); status(err) != http.StatusNotFound {
			t.Errorf("missing: %v", err)
		}
	})
}

func TestDeleteExactFile(t *testing.T) {
	home := t.TempDir()
	lsp := filepath.Join(home, ".kiro", "settings", "lsp.json")
	mcp := filepath.Join(home, ".kiro", "settings", "mcp.json")
	for _, p := range []string{lsp, mcp} {
		_ = os.MkdirAll(filepath.Dir(p), 0o755)
		_ = os.WriteFile(p, []byte("{}"), 0o644)
	}
	svc := NewFileExplorerService(utils.NewLogger(), false, func() system.DeletableRoots { return system.DeletableRoots{Exact: []string{lsp}} })
	if err := svc.Delete(lsp); err != nil {
		t.Errorf("lsp.json is deletable: %v", err)
	}
	if err := svc.Delete(mcp); err == nil {
		t.Error("another settings file next to it is not")
	}
}
