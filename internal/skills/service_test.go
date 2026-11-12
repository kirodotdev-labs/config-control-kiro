package skills

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

func newTestService(t *testing.T, rt http.RoundTripper) (*Service, string) {
	t.Helper()
	home := t.TempDir()
	t.Setenv("KIRO_HOME", home)
	logger := utils.NewLogger()
	client := &http.Client{Transport: rt}
	return NewService(system.NewKiroService(logger, "test"), logger, client), filepath.Join(home, "skills")
}

func writeSkill(t *testing.T, dir, front, body string) {
	t.Helper()
	_ = os.MkdirAll(dir, 0o755)
	_ = os.WriteFile(filepath.Join(dir, "SKILL.md"), []byte(front+body), 0o644)
}

func TestListReadsFrontMatterFilesAndProblems(t *testing.T) {
	svc, dir := newTestService(t, nil)
	writeSkill(t, filepath.Join(dir, "pr-review"), "---\nname: pr-review\ndescription: Review pull requests. Use when reviewing PRs.\nlicense: MIT\n---\n", "# Review\n")
	_ = os.MkdirAll(filepath.Join(dir, "pr-review", "scripts"), 0o755)
	_ = os.WriteFile(filepath.Join(dir, "pr-review", "scripts", "lint.sh"), []byte("echo"), 0o755)
	_ = os.WriteFile(filepath.Join(dir, "pr-review", ".hidden"), []byte("x"), 0o644)
	writeSkill(t, filepath.Join(dir, "bad-name"), "---\nname: other\n---\n", "")
	writeSkill(t, filepath.Join(dir, "plain"), "", "no front matter\n")
	_ = os.MkdirAll(filepath.Join(dir, "not-a-skill"), 0o755) // no SKILL.md

	list := svc.List()
	if len(list) != 3 {
		t.Fatalf("skills: %+v", list)
	}
	pr := list[2]
	if pr.Name != "pr-review" || pr.Description != "Review pull requests. Use when reviewing PRs." || len(pr.Problems) != 0 {
		t.Errorf("pr-review: %+v", pr)
	}
	if len(pr.Files) != 1 || pr.Files[0].Rel != "scripts/lint.sh" || pr.Files[0].Size != 4 {
		t.Errorf("files beside SKILL.md, hidden skipped: %+v", pr.Files)
	}
	if bad := list[0]; len(bad.Problems) != 2 || !strings.Contains(bad.Problems[0], `must match the folder name "bad-name"`) || !strings.Contains(bad.Problems[1], "description is missing") {
		t.Errorf("bad-name problems: %v", bad.Problems)
	}
	if plain := list[1]; len(plain.Problems) != 1 || !strings.Contains(plain.Problems[0], "no front matter") {
		t.Errorf("plain problems: %v", plain.Problems)
	}
	if _, err := svc.Get("not-a-skill"); err == nil {
		t.Error("a folder without SKILL.md is not a skill")
	}
	if _, err := svc.Get("../etc"); err == nil {
		t.Error("an invalid name is refused")
	}
}

func TestImportLocalFolder(t *testing.T) {
	svc, dir := newTestService(t, nil)
	src := filepath.Join(t.TempDir(), "deploy-cdk")
	writeSkill(t, src, "---\nname: deploy-cdk\ndescription: Deploy CDK stacks. Use when deploying.\n---\n", "steps\n")
	_ = os.MkdirAll(filepath.Join(src, "references"), 0o755)
	_ = os.WriteFile(filepath.Join(src, "references", "patterns.md"), []byte("p"), 0o644)
	sk, err := svc.Import(src)
	if err != nil || sk.Name != "deploy-cdk" || len(sk.Files) != 1 || sk.Files[0].Rel != "references/patterns.md" {
		t.Fatalf("import: %+v %v", sk, err)
	}
	if _, err := os.Stat(filepath.Join(dir, "deploy-cdk", "SKILL.md")); err != nil {
		t.Error("SKILL.md not copied")
	}
	if _, err := svc.Import(src); err == nil {
		t.Error("importing over an existing skill must be refused")
	}
	noSkill := t.TempDir()
	_ = os.WriteFile(filepath.Join(noSkill, "README.md"), []byte("x"), 0o644)
	if _, err := svc.Import(noSkill); err == nil || !strings.Contains(err.Error(), "no SKILL.md") {
		t.Errorf("a folder without SKILL.md: %v", err)
	}
	badName := filepath.Join(t.TempDir(), "Bad Name")
	writeSkill(t, badName, "---\nname: x\ndescription: y\n---\n", "")
	if _, err := svc.Import(badName); err == nil || !strings.Contains(err.Error(), "isn't a valid skill name") {
		t.Errorf("bad folder name: %v", err)
	}
	if _, err := svc.Import("   "); err == nil {
		t.Error("empty source refused")
	}
}

// ghEntryT is one row of the GitHub contents API listing.
type ghEntryT struct {
	Type        string `json:"type"`
	Path        string `json:"path"`
	DownloadURL string `json:"download_url"`
	Size        int64  `json:"size"`
}

// fakeGitHub answers the contents API and raw downloads for one repository folder.
type fakeGitHub struct{ files map[string]string }

func (f fakeGitHub) RoundTrip(req *http.Request) (*http.Response, error) {
	reply := func(code int, body string) *http.Response {
		return &http.Response{StatusCode: code, Body: io.NopCloser(strings.NewReader(body)), Header: http.Header{}}
	}
	u := req.URL
	if u.Host == "api.github.com" {
		dir := strings.TrimPrefix(u.Path, "/repos/acme/skills/contents/")
		var entries []ghEntryT
		seen := map[string]bool{}
		for p := range f.files {
			if !strings.HasPrefix(p, dir+"/") {
				continue
			}
			rest := strings.TrimPrefix(p, dir+"/")
			if i := strings.Index(rest, "/"); i >= 0 {
				sub := dir + "/" + rest[:i]
				if !seen[sub] {
					seen[sub] = true
					entries = append(entries, ghEntryT{Type: "dir", Path: sub})
				}
				continue
			}
			entries = append(entries, ghEntryT{Type: "file", Path: p, Size: int64(len(f.files[p])), DownloadURL: "https://raw.githubusercontent.com/acme/skills/main/" + p})
		}
		if len(entries) == 0 {
			return reply(404, `{"message":"Not Found"}`), nil
		}
		b, _ := json.Marshal(entries)
		return reply(200, string(b)), nil
	}
	if u.Host == "raw.githubusercontent.com" {
		p := strings.TrimPrefix(u.Path, "/acme/skills/main/")
		if body, ok := f.files[p]; ok {
			return reply(200, body), nil
		}
		return reply(404, ""), nil
	}
	return nil, fmt.Errorf("unexpected host %s", u.Host)
}

func TestImportFromGitHub(t *testing.T) {
	gh := fakeGitHub{files: map[string]string{
		"skills/pr-review/SKILL.md":            "---\nname: pr-review\ndescription: Review PRs. Use when reviewing.\n---\n# r\n",
		"skills/pr-review/scripts/check.sh":    "echo ok",
		"skills/pr-review/references/rules.md": "rules",
	}}
	svc, dir := newTestService(t, gh)
	sk, err := svc.Import("https://github.com/acme/skills/tree/main/skills/pr-review")
	if err != nil || sk.Name != "pr-review" || len(sk.Files) != 2 || len(sk.Problems) != 0 {
		t.Fatalf("github import: %+v %v", sk, err)
	}
	if data, _ := os.ReadFile(filepath.Join(dir, "pr-review", "scripts", "check.sh")); string(data) != "echo ok" {
		t.Error("nested file not copied")
	}
	_ = os.RemoveAll(filepath.Join(dir, "pr-review"))
	if sk, err := svc.Import("https://github.com/acme/skills/blob/main/skills/pr-review/SKILL.md"); err != nil || sk.Name != "pr-review" {
		t.Errorf("a SKILL.md URL imports its folder: %+v %v", sk, err)
	}
	for _, bad := range []string{"https://github.com/acme/skills", "https://github.com/acme/skills/tree/main", "https://gitlab.com/acme/skills/tree/main/x", "https://github.com/acme/skills/blob/main/skills/pr-review/README.md"} {
		var appErr *utils.AppError
		if _, err := svc.Import(bad); !errors.As(err, &appErr) || appErr.StatusCode != http.StatusBadRequest {
			t.Errorf("%s: %v, want a 400", bad, err)
		}
	}
	if _, err := svc.Import("https://github.com/acme/skills/tree/main/skills/missing"); err == nil || !strings.Contains(err.Error(), "nothing at that URL") {
		t.Errorf("missing folder: %v", err)
	}
}
