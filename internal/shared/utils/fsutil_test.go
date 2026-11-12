package utils

import (
	"os"
	"path/filepath"
	"testing"
)

func TestWriteFileAtomic(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "f.json")
	if err := WriteFileAtomic(path, []byte("one")); err != nil {
		t.Fatal(err)
	}
	if err := WriteFileAtomic(path, []byte("two")); err != nil {
		t.Fatal(err)
	}
	if data, _ := os.ReadFile(path); string(data) != "two" {
		t.Errorf("content %q", data)
	}
	entries, _ := os.ReadDir(filepath.Dir(path))
	if len(entries) != 1 {
		t.Errorf("temp files left behind: %v", entries)
	}
}

func TestWriteFileAtomicKeepsMode(t *testing.T) {
	path := filepath.Join(t.TempDir(), "secret.yaml")
	_ = os.WriteFile(path, []byte("a"), 0o600)
	if err := WriteFileAtomic(path, []byte("b")); err != nil {
		t.Fatal(err)
	}
	if info, _ := os.Stat(path); info.Mode().Perm() != 0o600 && info.Mode().Perm() != 0o666 {
		t.Errorf("mode changed: %v", info.Mode().Perm())
	}
	fresh := filepath.Join(filepath.Dir(path), "new.json")
	_ = WriteFileAtomic(fresh, []byte("x"))
	if info, _ := os.Stat(fresh); info.Mode().Perm()&0o044 == 0 && info.Mode().Perm() != 0o666 {
		t.Errorf("a new file is readable: %v", info.Mode().Perm())
	}
}
