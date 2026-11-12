package kirocli

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// fakeCLI answers kiro-cli invocations by their joined arguments.
type fakeCLI map[string]Result

func (f fakeCLI) runner() *Runner {
	return &Runner{
		Find: func() string { return "/fake/kiro-cli" },
		Exec: func(ctx context.Context, _ string, args ...string) (Result, error) {
			key := strings.Join(args, " ")
			if key == "slow" {
				<-ctx.Done()
				return Result{}, ctx.Err()
			}
			if r, ok := f[key]; ok {
				return r, nil
			}
			return Result{ExitCode: 2, Stderr: []byte("error: unrecognized subcommand '" + args[0] + "'")}, nil
		},
	}
}

const models = `{"models":[{"model_name":"auto","model_id":"auto"},{"model_name":"claude-sonnet-5","model_id":"claude-sonnet-5","rate_multiplier":1.3}],"default_model":"auto"}`

func healthy() fakeCLI {
	return fakeCLI{
		"--version":                        {Stdout: []byte("kiro-cli 2.40.1\n")},
		"chat --help":                      {Stdout: []byte("  --v3   Use the V3 agent harness\n  --all-cwds")},
		"agent upgrade --help":             {Stdout: []byte("Upgrade agent configs")},
		"powers --help":                    {Stdout: []byte("Manage powers")},
		"whoami --format json":             {Stdout: []byte(`{"accountType":"IamIdentityCenter","email":"me@example.com"}` + "\n\nProfile:\n")},
		"chat --list-models --format json": {Stdout: []byte(models)},
	}
}

func TestClassify(t *testing.T) {
	cases := []struct {
		res  Result
		want string
	}{
		{Result{ExitCode: 0}, ""},
		{Result{ExitCode: 3}, MCPStartup},
		{Result{ExitCode: 4}, AgentMissing},
		{Result{ExitCode: 2, Stderr: []byte("error: unrecognized subcommand 'upgrade'")}, Unsupported},
		{Result{ExitCode: 1, Stderr: []byte("Error: You are not logged in, please log in with kiro-cli login")}, NotSignedIn},
		{Result{ExitCode: 1, Stderr: []byte("dispatch failure: io error: Connection refused")}, Unreachable},
		{Result{ExitCode: 1, Stdout: []byte("something odd")}, Failed},
	}
	for _, c := range cases {
		p := Classify(c.res)
		if got := ""; p != nil {
			got = p.Code
			if got != c.want || p.Message == "" || p.Fix == "" {
				t.Errorf("%+v: got %+v want %s", c.res, p, c.want)
			}
		} else if c.want != "" {
			t.Errorf("%+v: got nil want %s", c.res, c.want)
		}
	}
}

func TestRunNotInstalledAndTimeout(t *testing.T) {
	r := healthy().runner()
	r.Find = func() string { return "" }
	if _, p := r.Run(context.Background(), time.Second, "--version"); p == nil || p.Code != NotInstalled {
		t.Errorf("missing binary: %+v", p)
	}
	r = healthy().runner()
	if _, p := r.Run(context.Background(), 20*time.Millisecond, "slow"); p == nil || p.Code != TimedOut {
		t.Errorf("timeout: %+v", p)
	}
	r.Exec = func(context.Context, string, ...string) (Result, error) {
		return Result{}, errors.New("permission denied")
	}
	if _, p := r.Run(context.Background(), time.Second, "x"); p == nil || p.Code != Failed || !strings.Contains(p.Detail, "permission denied") {
		t.Errorf("exec error: %+v", p)
	}
}

func TestStatus(t *testing.T) {
	t.Run("healthy", func(t *testing.T) {
		st := (&Service{Runner: healthy().runner()}).Status(true)
		if st.Level != LevelOK || st.Version != "2.40.1" || st.Account.Email != "me@example.com" || !st.Features.V3 || !st.Features.AgentUpgrade || !st.Reachable {
			t.Fatalf("%+v", st)
		}
	})
	t.Run("not installed", func(t *testing.T) {
		r := healthy().runner()
		r.Find = func() string { return "" }
		if st := (&Service{Runner: r}).Status(true); st.Level != LevelDown || st.Problem.Code != NotInstalled {
			t.Fatalf("%+v", st)
		}
	})
	t.Run("signed out", func(t *testing.T) {
		f := healthy()
		f["whoami --format json"] = Result{ExitCode: 1, Stdout: []byte(`{"account":null}`)}
		if st := (&Service{Runner: f.runner()}).Status(true); st.Level != LevelDown || st.SignedIn || st.Problem.Code != NotSignedIn {
			t.Fatalf("%+v", st)
		}
	})
	t.Run("unreachable", func(t *testing.T) {
		f := healthy()
		f["chat --list-models --format json"] = Result{ExitCode: 1, Stderr: []byte("dispatch failure: dns error")}
		if st := (&Service{Runner: f.runner()}).Status(true); st.Level != LevelDown || st.Reachable || st.Problem.Code != Unreachable {
			t.Fatalf("%+v", st)
		}
	})
	t.Run("old kiro-cli is degraded, not down", func(t *testing.T) {
		f := healthy()
		delete(f, "agent upgrade --help")
		st := (&Service{Runner: f.runner()}).Status(true)
		if st.Level != LevelDegraded || st.Features.AgentUpgrade || !st.Features.Powers || len(st.Notes) != 1 {
			t.Fatalf("%+v", st)
		}
	})
	t.Run("cached until refresh", func(t *testing.T) {
		var calls atomic.Int32
		r := healthy().runner()
		inner := r.Exec
		r.Exec = func(ctx context.Context, b string, a ...string) (Result, error) {
			calls.Add(1)
			return inner(ctx, b, a...)
		}
		s := &Service{Runner: r}
		s.Status(false)
		n := calls.Load()
		s.Status(false)
		if calls.Load() != n {
			t.Error("second call should be cached")
		}
		s.Status(true)
		if calls.Load() == n {
			t.Error("refresh should re-check")
		}
	})
}

func TestModels(t *testing.T) {
	s := &Service{Runner: healthy().runner()}
	if l := s.Models(false); len(l.Models) != 2 || l.Problem != nil {
		t.Fatalf("%+v", l)
	}
	f := healthy()
	f["chat --list-models --format json"] = Result{ExitCode: 1, Stderr: []byte("not logged in")}
	l := (&Service{Runner: f.runner()}).Models(false)
	if len(l.Models) != 1 || l.Models[0].ID != "auto" || l.Problem == nil || l.Problem.Code != NotSignedIn {
		t.Fatalf("fallback: %+v", l)
	}
}

func TestCappedBuffer(t *testing.T) {
	var b cappedBuffer
	big := strings.Repeat("x", maxOutput+10)
	if n, _ := b.Write([]byte(big)); n != len(big) || b.Len() != maxOutput {
		t.Fatalf("n=%d len=%d", n, b.Len())
	}
}

func TestParseSetting(t *testing.T) {
	cases := []struct {
		key, desc string
		check     func(Setting) bool
	}{
		{"chat.enableKnowledge", "Enable knowledge base functionality (boolean)", func(s Setting) bool {
			return s.Type == "boolean" && s.Group == "Chat" && s.Description == "Enable knowledge base functionality."
		}},
		{"chat.terminalTitle", "Show dynamic title in terminal tab (boolean, default: false)", func(s Setting) bool { return s.Type == "boolean" && s.Default == "false" }},
		{"chat.showThinking", "Show thinking blocks (boolean, default: false; startup-only)", func(s Setting) bool { return s.Restart && s.Default == "false" }},
		{"chat.agentEngine", "Default agent engine: 'v1', 'v2' (default), or 'v3' (string)", func(s Setting) bool {
			return len(s.Choices) == 3 && s.Choices[2].Value == "v3" && s.Default == "v2" && s.Engine == ""
		}},
		{"chat.historyMode", "Prompt history scope: 'session' (per-session) or 'global' (shared across sessions) (string)", func(s Setting) bool {
			return len(s.Choices) == 2 && s.Choices[0].Value == "session"
		}},
		{"chat.keybindings.quit", "V2 TUI keybinding to quit CLI. Syntax: 'ctrl+c', 'ctrl+q' (string, default: 'ctrl+c')", func(s Setting) bool {
			return len(s.Choices) == 0 && len(s.Examples) == 2 && s.Default == "ctrl+c" && s.Group == "Keybindings" && s.Engine == "v2"
		}},
		{"memory.mode", "Default memory access for new sessions: read_write, read_only, or disabled; requires the KAS engine (string)", func(s Setting) bool { return s.Engine == "v3" }},
		{"chat.tools.filters", "Legacy tool visibility filters (object)", func(s Setting) bool { return s.Engine == "v2" }},
		{"compaction.excludeContextWindowPercent", "Percentage of context window to exclude ([0, 100])", func(s Setting) bool {
			return s.Type == "number" && *s.Min == 0 && *s.Max == 100
		}},
		{"toolSearch.minPct", "Minimum percentage (number, e.g. 5 for 5%)", func(s Setting) bool { return s.Type == "number" && len(s.Examples) == 1 }},
		{"knowledge.defaultIncludePatterns", "Default file patterns (array)", func(s Setting) bool { return s.Type == "array" && s.Group == "Knowledge" }},
		{"api.krs.service", "KRS endpoint override (JSON object)", func(s Setting) bool { return s.Type == "object" && s.Advanced && s.Group == "Advanced" }},
		{"chat.skimCommandKey", "Key binding for fuzzy search command (single character)", func(s Setting) bool { return s.Type == "char" && s.Group == "Keybindings" }},
		{"mcp.initTimeout", "Kiro auth service endpoint", func(s Setting) bool { return s.Type == "string" && s.Group == "MCP" }},
	}
	for _, c := range cases {
		if got := parseSetting(c.key, c.desc); !c.check(got) {
			t.Errorf("%s: %+v", c.key, got)
		}
	}
}

func TestSettingsCatalog(t *testing.T) {
	f := healthy()
	f["settings list --all --format json"] = Result{Stdout: []byte(`[{"key":"chat.enableKnowledge","description":"Enable knowledge base functionality (boolean)"}]`)}
	if cat := (&Service{Runner: f.runner()}).SettingsCatalog(false); len(cat.Settings) != 1 || cat.Settings[0].Type != "boolean" {
		t.Fatalf("%+v", cat)
	}
	if missing := (&Service{Runner: healthy().runner()}).SettingsCatalog(false); missing.Problem == nil {
		t.Error("an unsupported settings command reports a problem")
	}
}

func TestPowers(t *testing.T) {
	home := t.TempDir()
	dir := filepath.Join(home, "powers")
	_ = os.MkdirAll(dir, 0o755)
	_ = os.WriteFile(filepath.Join(dir, "registry.json"), []byte(`{"lastUpdated":"2026-02-22T18:49:51.449Z","powers":{"figma":{"name":"figma","displayName":"Figma","description":"d"},"stripe":{"name":"stripe"}}}`), 0o644)
	_ = os.WriteFile(filepath.Join(dir, "installed.json"), []byte(`{"installedPowers":["stripe",{"name":"local-tool"}]}`), 0o644)
	got := Powers(home)
	if got.CatalogUpdated != "2026-02-22T18:49:51.449Z" {
		t.Errorf("catalog date: %q", got.CatalogUpdated)
	}
	if len(got.Catalog) != 2 || got.Catalog[0].Name != "figma" || got.Catalog[0].Installed || !got.Catalog[1].Installed {
		t.Fatalf("catalog %+v", got.Catalog)
	}
	if len(got.Installed) != 2 || got.Installed[0].Name != "local-tool" || got.Installed[1].Name != "stripe" {
		t.Fatalf("installed %+v", got.Installed)
	}
	if empty := Powers(t.TempDir()); empty.Catalog == nil || empty.Installed == nil || empty.Unreadable != "" {
		t.Error("missing files give empty lists, not null")
	}
	_ = os.WriteFile(filepath.Join(dir, "installed.json"), []byte(`{"installedPowers":{"changed":"shape"}}`), 0o644)
	if got := Powers(home); got.Unreadable != "installed.json" {
		t.Errorf("a file in a shape Kiro may have changed is reported: %+v", got)
	}
	// Kiro CLI 2.34.2 writes this when nothing is installed.
	_ = os.WriteFile(filepath.Join(dir, "installed.json"), []byte(`{"version":"1.0.0","installedPowers":[],"dismissedAutoInstalls":[]}`), 0o644)
	if got := Powers(home); got.Unreadable != "" || len(got.Installed) != 0 {
		t.Errorf("the real empty file: %+v", got)
	}

	f := healthy()
	f["powers install figma"] = Result{Stdout: []byte("Installed figma")}
	f["powers uninstall stripe"] = Result{Stdout: []byte("Uninstalled stripe")}
	s := &Service{Runner: f.runner()}
	if out, err := s.InstallPower("figma"); err != nil || out != "Installed figma" {
		t.Errorf("install: %q %v", out, err)
	}
	if _, err := s.UninstallPower("stripe"); err != nil {
		t.Errorf("uninstall: %v", err)
	}
	if _, err := s.InstallPower("-rf"); err == nil {
		t.Error("a flag-looking name must be rejected")
	}
	if _, err := s.InstallPower(t.TempDir()); err == nil || !strings.Contains(err.Error(), "plugin.json") {
		t.Errorf("a folder without a manifest is rejected: %v", err)
	}
	if _, err := s.UninstallPower("../x"); err == nil {
		t.Error("uninstall takes names only")
	}
	f["powers install figma"] = Result{ExitCode: 1, Stderr: []byte("dispatch failure: dns error")}
	if _, err := (&Service{Runner: f.runner()}).InstallPower("figma"); err == nil || !strings.Contains(err.Error(), "can't be reached") {
		t.Errorf("failures come back as Kiro problems: %v", err)
	}
}

func TestParseAgentList(t *testing.T) {
	out := "\x1b[38;5;11mWARNING: \x1b[0mDuplicate agent\n\x1b[38;5;244mWorkspace: \x1b[0m~/x/.kiro/agents\n\n" +
		"* kiro_default                   \x1b[38;5;244m(Built-in)\x1b[0m    Default agent\n" +
		"  amzn-builder                   Global        Amazon tools\n" +
		"                                                that wraps\n" +
		"  kiro_planner                   \x1b[38;5;244m(Built-in)\x1b[0m    Specialized planning agent that\n" +
		"                                                helps break down ideas\n" +
		"  mine                           Workspace     Local one\n"
	got := parseAgentList(out)
	if len(got.Agents) != 2 || got.Default != "kiro_default" || !got.Agents[0].Default {
		t.Fatalf("%+v", got)
	}
	if got.Agents[1].Name != "kiro_planner" || got.Agents[1].Description != "Specialized planning agent that helps break down ideas" {
		t.Errorf("wrapped description: %+v", got.Agents[1])
	}
	custom := parseAgentList("  kiro_default   (Built-in)    Default agent\n* mine   Global   Mine\n")
	if custom.Default != "mine" || custom.Agents[0].Default {
		t.Errorf("custom default: %+v", custom)
	}
	f := healthy()
	f["agent list"] = Result{Stderr: []byte(out)}
	if b := (&Service{Runner: f.runner()}).BuiltinAgents(false); len(b.Agents) != 2 || b.Problem != nil {
		t.Errorf("service reads stderr too: %+v", b)
	}
	f["agent list"] = Result{Stdout: []byte("nothing")}
	if b := (&Service{Runner: f.runner()}).BuiltinAgents(false); b.Problem == nil {
		t.Error("no built-ins is reported")
	}
}

func TestParsePlan(t *testing.T) {
	real := "Estimated Usage | resets on 2026-11-01 | KIRO POWER\nCredits (4287.14 of 10000 covered in plan), 42.9%\nOverages: Enabled\nOverages credits: 0.00 credits\nYour plan is managed by your organization's administrator.\n"
	p, ok := parsePlan("\x1b[1m" + real)
	if !ok || p.Name != "KIRO POWER" || p.ResetsOn != "2026-11-01" || p.Used != 4287.14 || p.Limit != 10000 || !p.HasLimit || p.Percent != 42.9 {
		t.Fatalf("real output: %+v", p)
	}
	if p.Overages == nil || !p.Overages.Enabled || p.Overages.Credits != 0 || !p.Managed || p.Free {
		t.Errorf("overages/managed: %+v %+v", p, p.Overages)
	}
	over, _ := parsePlan("Estimated Usage | resets on 2026-11-01 | KIRO PRO\nCredits (1,250.50 of 1,000 covered in plan)\nOverages: Enabled\nOverages credits: 250.50 credits\n")
	if over.Used != 1250.5 || over.Limit != 1000 || over.Percent < 125 || over.Overages.Credits != 250.5 || over.Managed {
		t.Errorf("over the limit: %+v", over)
	}
	off, _ := parsePlan("Estimated Usage | resets on 2026-11-01 | KIRO PRO\nCredits (10 of 1000 covered in plan)\nOverages: Disabled\nmanaged by your organization")
	if off.Overages == nil || off.Overages.Enabled || !off.Managed {
		t.Errorf("disabled: %+v", off)
	}
	free, _ := parsePlan("Estimated Usage | resets on 2026-11-01 | KIRO FREE\nCredits (12.5 of 50 covered in plan)\n████░░ 25.0%")
	if !free.Free || free.Overages != nil || free.Percent != 25 {
		t.Errorf("free: %+v", free)
	}
	nolimit, _ := parsePlan("Estimated Usage\nCredits (812.25 used)")
	if nolimit.HasLimit || nolimit.Used != 812.25 || nolimit.Percent != 0 {
		t.Errorf("no limit: %+v", nolimit)
	}
	if _, ok := parsePlan("Welcome to Kiro\nsomething else"); ok {
		t.Error("unrecognised output is not a plan")
	}
}

func TestPlanService(t *testing.T) {
	f := healthy()
	f["chat --no-interactive /usage"] = Result{Stdout: []byte("Estimated Usage | resets on 2026-11-01 | KIRO POWER\nCredits (1 of 10 covered in plan)\n")}
	s := &Service{Runner: f.runner()}
	if p := s.Plan(false); p.Problem != nil || p.Used != 1 {
		t.Fatalf("%+v", p)
	}
	f["chat --no-interactive /usage"] = Result{Stdout: []byte("Estimated Usage | resets on 2026-11-01 | KIRO POWER\nCredits (2 of 10 covered in plan)\n")}
	if p := s.Plan(false); p.Used != 1 {
		t.Error("cached for five minutes")
	}
	if p := s.Plan(true); p.Used != 2 {
		t.Error("refresh asks again")
	}
	cases := map[string]Result{
		NotSignedIn: {ExitCode: 1, Stderr: []byte("You are not logged in")},
		Unreachable: {ExitCode: 1, Stderr: []byte("dispatch failure: dns error")},
		Failed:      {Stdout: []byte("Hello there")},
	}
	for want, res := range cases {
		f["chat --no-interactive /usage"] = res
		if p := (&Service{Runner: f.runner()}).Plan(false); p.Problem == nil || p.Problem.Code != want {
			t.Errorf("%s: %+v", want, p.Problem)
		}
	}
	f["chat --no-interactive /usage"] = Result{Stdout: []byte("Please sign in to continue")}
	if p := (&Service{Runner: f.runner()}).Plan(false); p.Problem == nil || p.Problem.Code != NotSignedIn {
		t.Errorf("exit 0 with a sign-in message: %+v", p.Problem)
	}
}
