package utils

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestResolvePath(t *testing.T) {
	dir := t.TempDir()
	subDir := filepath.Join(dir, "sub")
	if err := os.MkdirAll(subDir, 0755); err != nil {
		t.Fatalf("setup mkdir: %v", err)
	}
	filePath := filepath.Join(subDir, "file.txt")
	if err := os.WriteFile(filePath, []byte("hello"), 0644); err != nil {
		t.Fatalf("setup write: %v", err)
	}

	t.Run("empty path is invalid", func(t *testing.T) {
		res := ResolvePath("", false)
		if res.Valid {
			t.Fatal("expected invalid for empty input")
		}
		if res.Error == "" {
			t.Fatal("expected error message")
		}
	})

	t.Run("whitespace-only path is invalid", func(t *testing.T) {
		res := ResolvePath("   ", false)
		if res.Valid {
			t.Fatal("expected invalid for whitespace input")
		}
	})

	t.Run("existing directory resolves as directory", func(t *testing.T) {
		res := ResolvePath(dir, false)
		if !res.Valid {
			t.Fatalf("expected valid, got error: %s", res.Error)
		}
		if res.Type != "directory" {
			t.Fatalf("expected type=directory, got %s", res.Type)
		}
		if res.ResolvedPath != dir {
			t.Fatalf("expected resolved=%s, got %s", dir, res.ResolvedPath)
		}
	})

	t.Run("existing file resolves as file with parent", func(t *testing.T) {
		res := ResolvePath(filePath, false)
		if !res.Valid {
			t.Fatalf("expected valid, got error: %s", res.Error)
		}
		if res.Type != "file" {
			t.Fatalf("expected type=file, got %s", res.Type)
		}
		if res.ParentPath != subDir {
			t.Fatalf("expected parent=%s, got %s", subDir, res.ParentPath)
		}
	})

	t.Run("non-existent path is invalid", func(t *testing.T) {
		res := ResolvePath(filepath.Join(dir, "missing"), false)
		if res.Valid {
			t.Fatal("expected invalid for missing path")
		}
		if res.Exists {
			t.Fatal("expected Exists=false")
		}
		if !strings.Contains(res.Error, "not found") {
			t.Fatalf("expected 'not found' in error, got %s", res.Error)
		}
	})

	t.Run("path traversal is rejected", func(t *testing.T) {
		res := ResolvePath("/tmp/../etc/passwd", false)
		if res.Valid {
			t.Fatal("expected invalid for traversal")
		}
		if !strings.Contains(res.Error, "traversal") {
			t.Fatalf("expected traversal error, got %s", res.Error)
		}
	})

	t.Run("strips surrounding quotes", func(t *testing.T) {
		quoted := `"` + dir + `"`
		res := ResolvePath(quoted, false)
		if !res.Valid {
			t.Fatalf("expected valid for quoted path, got %s", res.Error)
		}
	})

	t.Run("strips surrounding whitespace", func(t *testing.T) {
		res := ResolvePath("  "+dir+"  ", false)
		if !res.Valid {
			t.Fatalf("expected valid for whitespace-padded path, got %s", res.Error)
		}
	})

	t.Run("home expansion works", func(t *testing.T) {
		home, err := os.UserHomeDir()
		if err != nil {
			t.Skip("no home dir available")
		}
		res := ResolvePath("~", false)
		if !res.Valid {
			t.Fatalf("expected valid for ~, got %s", res.Error)
		}
		if res.ResolvedPath != home {
			t.Fatalf("expected resolved=%s, got %s", home, res.ResolvedPath)
		}
	})

	t.Run("windows path on non-WSL non-Windows is rejected", func(t *testing.T) {
		if runtime.GOOS == "windows" {
			t.Skip("test does not apply on native Windows")
		}
		res := ResolvePath(`C:\Users\test`, false)
		if res.Valid {
			t.Fatal("expected invalid for windows path on Linux without WSL")
		}
		if !strings.Contains(res.Error, "Windows") {
			t.Fatalf("expected Windows error, got %s", res.Error)
		}
	})

	t.Run("windows path translates to WSL mount", func(t *testing.T) {
		// We can only verify the translated form because /mnt/c usually
		// won't exist in test environments. So check the error path that
		// reports the resolved (translated) location.
		res := ResolvePath(`C:\Users\test\Downloads`, true)
		if res.Valid {
			t.Skip("path actually exists — cannot assert translation via error")
		}
		if !strings.HasPrefix(res.ResolvedPath, "/mnt/c/") {
			t.Fatalf("expected /mnt/c/ prefix, got %s", res.ResolvedPath)
		}
		if !strings.Contains(res.ResolvedPath, "Users/test/Downloads") {
			t.Fatalf("unexpected translated path: %s", res.ResolvedPath)
		}
	})

	t.Run("mangled mixed-slash WSL path is normalized", func(t *testing.T) {
		// The exact bug case from production: a Windows path with a stray
		// forward slash that previously created a literal broken folder.
		res := ResolvePath(`C:\Users\mrnaidoo\Downloads\/testing`, true)
		expected := "/mnt/c/Users/mrnaidoo/Downloads/testing"
		if res.ResolvedPath != expected {
			t.Fatalf("expected %s, got %s", expected, res.ResolvedPath)
		}
	})

	t.Run("forward-slash windows path translates to WSL mount", func(t *testing.T) {
		res := ResolvePath(`C:/Users/test`, true)
		if !strings.HasPrefix(res.ResolvedPath, "/mnt/c/Users/test") {
			t.Fatalf("expected /mnt/c/Users/test prefix, got %s", res.ResolvedPath)
		}
	})
}

func TestTranslateWindowsToWSL(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{`C:\Users\test`, "/mnt/c/Users/test"},
		{`D:\projects\repo`, "/mnt/d/projects/repo"},
		{`c:/Users/test`, "/mnt/c/Users/test"},
		{`C:\Users\name\Downloads\/testing`, "/mnt/c/Users/name/Downloads/testing"},
		{`C:\\double\\slashes`, "/mnt/c/double/slashes"},
	}
	for _, tc := range cases {
		got := translateWindowsToWSL(tc.in)
		if got != tc.want {
			t.Errorf("translateWindowsToWSL(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}
