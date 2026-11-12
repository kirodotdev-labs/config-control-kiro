package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestKeygenSignVerify(t *testing.T) {
	dir := t.TempDir()
	var out bytes.Buffer
	if err := run([]string{"keygen", dir}, &out); err != nil {
		t.Fatal(err)
	}
	key, _ := os.ReadFile(filepath.Join(dir, "update-signing.key"))
	if strings.Contains(out.String(), strings.TrimSpace(string(key))) {
		t.Fatal("keygen must never print the private key")
	}
	if info, _ := os.Stat(filepath.Join(dir, "update-signing.key")); info.Mode().Perm() != 0o600 && os.PathSeparator == '/' {
		t.Errorf("private key mode %v", info.Mode().Perm())
	}
	if err := run([]string{"keygen", dir}, &out); err == nil {
		t.Error("keygen refuses to overwrite a key")
	}
	pub := strings.TrimSpace(string(must(os.ReadFile(filepath.Join(dir, "update-signing.pub")))))
	file := filepath.Join(dir, "cckiro-linux-amd64.tar.gz")
	_ = os.WriteFile(file, []byte("archive"), 0o644)

	t.Setenv("UPDATE_SIGNING_KEY_FILE", filepath.Join(dir, "update-signing.key"))
	if err := run([]string{"sign", "1.3.0", file}, &out); err != nil {
		t.Fatal(err)
	}
	if err := run([]string{"verify", pub, "1.3.0", file}, &out); err != nil {
		t.Fatal(err)
	}
	if err := run([]string{"verify", pub, "1.3.1", file}, &out); err == nil {
		t.Error("a signature is bound to its version")
	}
	_ = os.WriteFile(file, []byte("tampered"), 0o644)
	if err := run([]string{"verify", pub, "1.3.0", file}, &out); err == nil {
		t.Error("a changed file fails")
	}
	t.Setenv("UPDATE_SIGNING_KEY_FILE", "")
	if err := run([]string{"sign", "1.3.0", file}, &out); err == nil {
		t.Error("signing without a key fails")
	}
}

func must(b []byte, err error) []byte {
	if err != nil {
		panic(err)
	}
	return b
}
