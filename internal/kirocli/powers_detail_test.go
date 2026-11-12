package kirocli

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kiromanager/internal/shared/ghfolder"
)

func writeTree(t *testing.T, dir string, files map[string]string) {
	t.Helper()
	for rel, data := range files {
		p := filepath.Join(dir, filepath.FromSlash(rel))
		_ = os.MkdirAll(filepath.Dir(p), 0o755)
		if err := os.WriteFile(p, []byte(data), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

func TestReadPowerBothFormats(t *testing.T) {
	home := t.TempDir()
	// The original format, as Kiro installs the Postman power.
	writeTree(t, filepath.Join(home, "powers", "installed", "postman"), map[string]string{
		"POWER.md":             "---\nname: \"postman\"\ndisplayName: \"API Testing with Postman\"\ndescription: \"Automate API testing\"\nkeywords: [\"postman\", \"api\", \"testing\"]\nauthor: \"Postman\"\n---\n\n# Onboarding\n",
		"mcp.json":             `{"mcpServers":{"postman":{"url":"https://mcp.postman.com/minimal","disabled":false}}}`,
		"steering/steering.md": "# guide",
	})
	d, err := InstalledPower(home, "postman")
	if err != nil {
		t.Fatal(err)
	}
	if d.Manifest.Format != "POWER.md" || d.Manifest.DisplayName != "API Testing with Postman" || strings.Join(d.Manifest.Keywords, ",") != "postman,api,testing" || d.Manifest.Author != "Postman" {
		t.Errorf("POWER.md manifest: %+v", d.Manifest)
	}
	if len(d.Servers) != 1 || d.Servers[0].Summary != "https://mcp.postman.com/minimal" || len(d.Steering) != 1 || d.Steering[0] != "steering/steering.md" || d.Instructions != "POWER.md" || len(d.Files) != 3 || !d.Installed {
		t.Errorf("contents: %+v", d)
	}
	if len(d.Problems) != 0 {
		t.Errorf("a valid POWER.md has no problems: %v", d.Problems)
	}

	// The Agent Plugins format, as a folder you keep yourself.
	src := filepath.Join(t.TempDir(), "team-api")
	writeTree(t, src, map[string]string{
		"plugin.json":                 `{"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json","name":"team-api","version":"1.0.0","description":"Our API","author":{"name":"Team"},"keywords":["team api","orders"]}`,
		"skills/setup/SKILL.md":       "---\nname: setup\ndescription: Set up. Use when starting.\n---\n",
		"skills/notaskill/x.txt":      "x",
		"mcp.json":                    `{"mcpServers":{"api":{"command":"npx","args":["-y","team-api-mcp"]}}}`,
		"dev.kiro/steering/naming.md": "# naming",
		"steering/ignored.md":         "# Kiro reads dev.kiro/steering for this format",
	})
	s, err := PowerSource(src)
	if err != nil {
		t.Fatal(err)
	}
	if s.Manifest.Format != "plugin.json" || s.Manifest.Author != "Team" || s.Manifest.Version != "1.0.0" || len(s.Skills) != 1 || s.Skills[0] != "setup" || s.Servers[0].Summary != "npx -y team-api-mcp" || s.Installed {
		t.Errorf("plugin.json power: %+v", s)
	}
	if strings.Join(s.Steering, ",") != "dev.kiro/steering/naming.md" || s.SteeringDir != "dev.kiro/steering" || s.Instructions != "dev.kiro/INSTRUCTIONS.md" {
		t.Errorf("plugin.json steering lives in dev.kiro: %v %s %s", s.Steering, s.SteeringDir, s.Instructions)
	}
	// A POWER.md power's skills/ folder is ignored by Kiro: said, not listed.
	legacy := filepath.Join(t.TempDir(), "old")
	writeTree(t, legacy, map[string]string{"POWER.md": "---\nname: old\ndescription: d\nkeywords: [old]\n---\n", "skills/x/SKILL.md": "---\nname: x\n---\n"})
	if l, _ := PowerSource(legacy); len(l.Skills) != 0 || !strings.Contains(strings.Join(l.Problems, " "), "ignores its skills/") {
		t.Errorf("POWER.md skills: %+v", l)
	}

	// Problems: the docs' required fields.
	bad := filepath.Join(t.TempDir(), "Bad_Name")
	writeTree(t, bad, map[string]string{"plugin.json": `{"name":"Bad_Name"}`, "mcp.json": "{nope"})
	b, _ := PowerSource(bad)
	got := strings.Join(b.Problems, " | ")
	for _, want := range []string{"mcp.json isn't valid JSON", "kebab-case", "description is required", "keywords are required", "version is required", "author.name is required"} {
		if !strings.Contains(got, want) {
			t.Errorf("missing problem %q in %s", want, got)
		}
	}
	writeTree(t, filepath.Join(SourcesDir(home), "mine"), map[string]string{"plugin.json": `{"name":"mine","version":"0.1.0","description":"d","author":{"name":"me"},"keywords":["mine"]}`})
	_ = os.MkdirAll(filepath.Join(SourcesDir(home), "empty"), 0o755)
	if list := PowerSources(home); len(list) != 1 || list[0].Manifest.Name != "mine" || len(list[0].Problems) != 0 {
		t.Errorf("your power folders: %+v", list)
	}
	if _, err := PowerSource(t.TempDir()); err == nil {
		t.Error("a folder without a manifest isn't a power")
	}
	for _, name := range []string{"../etc", "nope"} {
		if _, err := InstalledPower(home, name); err == nil {
			t.Errorf("%q must fail", name)
		}
	}
}

// fakeGitHub serves one repository folder through the contents API and raw downloads.
type fakeGitHub map[string]string

func (f fakeGitHub) RoundTrip(req *http.Request) (*http.Response, error) {
	reply := func(code int, body string) *http.Response {
		return &http.Response{StatusCode: code, Body: io.NopCloser(strings.NewReader(body)), Header: http.Header{}}
	}
	if req.URL.Host == "api.github.com" {
		dir := strings.TrimPrefix(req.URL.Path, "/repos/acme/powers/contents/")
		var out []map[string]any
		for p, body := range f {
			if strings.HasPrefix(p, dir+"/") && !strings.Contains(strings.TrimPrefix(p, dir+"/"), "/") {
				out = append(out, map[string]any{"type": "file", "path": p, "size": len(body), "download_url": "https://raw.githubusercontent.com/acme/powers/main/" + p})
			}
		}
		if len(out) == 0 {
			return reply(404, ""), nil
		}
		b, _ := json.Marshal(out)
		return reply(200, string(b)), nil
	}
	if body, ok := f[strings.TrimPrefix(req.URL.Path, "/acme/powers/main/")]; ok {
		return reply(200, body), nil
	}
	return reply(404, ""), nil
}

func TestInstallFromGitHub(t *testing.T) {
	var installed string
	svc := &Service{
		Runner: &Runner{Find: func() string { return "/fake/kiro-cli" }, Exec: func(_ context.Context, _ string, args ...string) (Result, error) {
			// kiro-cli powers install <folder>: check the folder holds the power while it runs.
			if len(args) == 3 && args[1] == "install" {
				if data, err := os.ReadFile(filepath.Join(args[2], "plugin.json")); err == nil && strings.Contains(string(data), "team-api") {
					installed = args[2]
				}
			}
			return Result{Stdout: []byte(`Installed power "team-api"`)}, nil
		}},
		fetch: ghfolder.New(&http.Client{Transport: fakeGitHub{
			"powers/team-api/plugin.json": `{"name":"team-api"}`,
			"powers/team-api/mcp.json":    `{"mcpServers":{}}`,
			"powers/readme-only/README":   "x",
		}}),
	}
	out, err := svc.InstallFromGitHub("https://github.com/acme/powers/tree/main/powers/team-api")
	if err != nil || !strings.Contains(out, "Installed") || filepath.Base(installed) != "team-api" {
		t.Fatalf("install: %q %v (folder %q)", out, err, installed)
	}
	if _, err := os.Stat(installed); !os.IsNotExist(err) {
		t.Error("the temporary copy is removed afterwards")
	}
	if _, err := svc.InstallFromGitHub("https://github.com/acme/powers/tree/main/powers/readme-only"); err == nil || !strings.Contains(err.Error(), "no plugin.json or POWER.md") {
		t.Errorf("a folder without a manifest: %v", err)
	}
	if _, err := svc.InstallFromGitHub("https://github.com/acme/powers"); err == nil {
		t.Error("the repository root is refused")
	}
}
