package ghfolder

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kiromanager/internal/shared/utils"
)

// fakeGitHub serves the contents API and raw downloads for one repository, from files.
type fakeGitHub map[string]string

func (f fakeGitHub) RoundTrip(req *http.Request) (*http.Response, error) {
	resp := func(code int, body string) *http.Response {
		return &http.Response{StatusCode: code, Body: io.NopCloser(strings.NewReader(body)), Header: http.Header{}}
	}
	if req.URL.Host == "raw.githubusercontent.com" {
		p := strings.TrimPrefix(req.URL.Path, "/acme/repo/main/")
		if b, ok := f[p]; ok {
			return resp(200, b), nil
		}
		return resp(404, ""), nil
	}
	dir := strings.TrimPrefix(req.URL.Path, "/repos/acme/repo/contents/")
	var out []map[string]any
	seen := map[string]bool{}
	for p, b := range f {
		if !strings.HasPrefix(p, dir+"/") {
			continue
		}
		rest := strings.TrimPrefix(p, dir+"/")
		if i := strings.Index(rest, "/"); i >= 0 {
			sub := dir + "/" + rest[:i]
			if !seen[sub] {
				seen[sub] = true
				out = append(out, map[string]any{"type": "dir", "path": sub})
			}
			continue
		}
		out = append(out, map[string]any{"type": "file", "path": p, "size": len(b), "download_url": "https://raw.githubusercontent.com/acme/repo/main/" + p})
	}
	if len(out) == 0 {
		return resp(404, ""), nil
	}
	b, _ := json.Marshal(out)
	return resp(200, string(b)), nil
}

func code(err error) string {
	var ae *utils.AppError
	if errors.As(err, &ae) {
		return ae.Code
	}
	return ""
}

func TestParseURL(t *testing.T) {
	ref, err := ParseURL("https://github.com/acme/repo/tree/main/skills/review", "skill")
	if err != nil || ref.Owner != "acme" || ref.Repo != "repo" || ref.Branch != "main" || ref.Dir != "skills/review" {
		t.Fatalf("%+v %v", ref, err)
	}
	if ref, err := ParseURL("https://github.com/acme/repo/blob/main/skills/review/SKILL.md", "skill", "SKILL.md"); err != nil || ref.Dir != "skills/review" {
		t.Errorf("a file URL points at its folder: %+v %v", ref, err)
	}
	for raw, want := range map[string]string{
		"https://gitlab.com/acme/repo/tree/main/x":          "NOT_GITHUB",
		"https://github.com/acme/repo":                      "NOT_A_FOLDER_URL",
		"https://github.com/acme/repo/blob/main/x/other.md": "NOT_A_FOLDER_URL",
	} {
		if _, err := ParseURL(raw, "skill", "SKILL.md"); code(err) != want {
			t.Errorf("%s: %v, want %s", raw, err, want)
		}
	}
	if !IsURL("https://x") || IsURL("/home/x") {
		t.Error("IsURL")
	}
}

func TestFetch(t *testing.T) {
	gh := fakeGitHub{"skills/review/SKILL.md": "# r", "skills/review/scripts/run.sh": "echo", "skills/other/SKILL.md": "x"}
	f := New(&http.Client{Transport: gh})
	name, files, err := f.Fetch("https://github.com/acme/repo/tree/main/skills/review", "skill")
	if err != nil || name != "review" || len(files) != 2 || string(files["scripts/run.sh"]) != "echo" {
		t.Fatalf("%s %v %v", name, files, err)
	}
	t.Run("too large", func(t *testing.T) {
		big := fakeGitHub{"p/big.bin": strings.Repeat("x", MaxFileBytes+1)}
		if _, _, err := New(&http.Client{Transport: big}).Fetch("https://github.com/acme/repo/tree/main/p", "power"); code(err) != "FILE_TOO_LARGE" {
			t.Errorf("%v", err)
		}
	})
	t.Run("not found", func(t *testing.T) {
		if _, _, err := f.Fetch("https://github.com/acme/repo/tree/main/nope", "skill"); code(err) != "GITHUB_NOT_FOUND" {
			t.Errorf("%v", err)
		}
	})
	t.Run("only https github hosts", func(t *testing.T) {
		if _, err := f.get("http://raw.githubusercontent.com/x", 10); code(err) != "UNSAFE_URL" {
			t.Errorf("http: %v", err)
		}
		if _, err := f.get("https://evil.example.com/x", 10); code(err) != "UNSAFE_URL" {
			t.Errorf("other host: %v", err)
		}
	})
}

func TestReadLocalAndWrite(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "my-skill")
	_ = os.MkdirAll(filepath.Join(dir, "scripts"), 0o755)
	_ = os.WriteFile(filepath.Join(dir, "SKILL.md"), []byte("# s"), 0o644)
	_ = os.WriteFile(filepath.Join(dir, "scripts", "a.sh"), []byte("echo"), 0o644)
	_ = os.WriteFile(filepath.Join(dir, ".secret"), []byte("hidden"), 0o644)
	if err := os.Symlink("/etc/passwd", filepath.Join(dir, "link")); err != nil && os.PathSeparator == '/' {
		t.Fatal(err)
	}
	name, files, err := ReadLocal(dir, "skill")
	if err != nil || name != "my-skill" || len(files) != 2 || files["scripts/a.sh"] == nil {
		t.Fatalf("%s %v %v", name, files, err)
	}
	if _, ok := files[".secret"]; ok {
		t.Error("hidden files are skipped")
	}
	if _, ok := files["link"]; ok {
		t.Error("links are never followed")
	}
	if _, _, err := ReadLocal(filepath.Join(dir, "SKILL.md"), "skill"); code(err) != "NOT_A_FOLDER" {
		t.Errorf("a file isn't a folder: %v", err)
	}
	dest := filepath.Join(t.TempDir(), "out")
	if err := files.Write(dest); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(filepath.Join(dest, "scripts", "a.sh")); string(b) != "echo" {
		t.Error("written")
	}
	var total int64
	for _, bad := range []string{"../x", "/abs", "a/../../b", ""} {
		if err := add(Files{}, &total, bad, nil, "skill"); code(err) != "UNSAFE_PATH" {
			t.Errorf("%q: %v", bad, err)
		}
	}
	many := Files{}
	for i := 0; i < MaxFiles; i++ {
		many[strings.Repeat("a", i+1)] = nil
	}
	if err := add(many, &total, "one-more", nil, "skill"); code(err) != "TOO_MANY_FILES" {
		t.Errorf("file count limit: %v", err)
	}
}
