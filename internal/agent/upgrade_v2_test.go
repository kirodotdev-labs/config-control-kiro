package agent

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"kiromanager/internal/kirocli"
	"kiromanager/internal/shared/ordered"
)

// fakeUpgrader stands in for kiro-cli. `agent upgrade <dir>` adds a
// permissions block and Kiro's marker to every JSON agent in dir, like the
// real command does; it records the last arguments for assertions.
func fakeUpgrader(t *testing.T) *kirocli.Runner {
	t.Helper()
	return &kirocli.Runner{
		Find: func() string { return "/fake/kiro-cli" },
		Exec: func(_ context.Context, _ string, args ...string) (kirocli.Result, error) {
			lastArgs = args
			if len(args) < 3 || args[0] != "agent" || args[1] != "upgrade" {
				return kirocli.Result{ExitCode: 2, Stderr: []byte("error: unrecognized subcommand")}, nil
			}
			if upgradeUnsupported {
				return kirocli.Result{ExitCode: 2, Stderr: []byte("error: unrecognized subcommand 'upgrade'")}, nil
			}
			dryRun := strings.Contains(strings.Join(args, " "), "--dry-run")
			files, _ := filepath.Glob(filepath.Join(args[2], "*.json"))
			for _, f := range files {
				var spec map[string]any
				data, _ := os.ReadFile(f)
				if json.Unmarshal(data, &spec) != nil || spec["allowedTools"] == nil || dryRun {
					continue
				}
				spec["permissions"] = map[string]any{"rules": []any{map[string]any{"capability": "fs_read", "effect": "allow"}}}
				spec["kiroUpgrade"] = map[string]any{"v": 1}
				out, _ := json.MarshalIndent(spec, "", "  ")
				_ = os.WriteFile(f, out, 0o644)
			}
			return kirocli.Result{Stdout: []byte("Upgraded agents in " + args[2])}, nil
		},
	}
}

var (
	lastArgs           []string
	upgradeUnsupported bool
)

const legacySpec = `{"name":"old","prompt":"x","allowedTools":["fs_read"],"toolsSettings":{"execute_bash":{"allowedCommands":["git status"]},"subagent":{}},"hooks":{"agentSpawn":[{"command":"git status"}]},"tools":["fs_read"]}`

func TestReadiness(t *testing.T) {
	cases := []struct {
		name, spec, state string
		converted, lost   int
		universal         bool
	}{
		{"v3 agent", `{"name":"a","tools":["read","@git"],"permissions":{"rules":[]},"hooks":[]}`, ReadyV3, 0, 0, false},
		{"2.x agent without permissions is blocked", legacySpec, BlockedOnV3, 5, 0, false},
		{"legacy fields with permissions only need an upgrade", `{"toolAliases":{"@git/status":"gs"},"permissions":{"rules":[]},"allowedTools":[]}`, NeedsUpgrade, 1, 1, false},
		{"2.x sub-agent settings need Kiro's upgrade", `{"name":"o","tools":["subagent"],"toolsSettings":{"subagent":{"trustedAgents":["r"],"agentPermissions":{}}}}`, BlockedOnV3, 1, 1, false},
		{"universal config from Kiro's upgrade counts as V3 and still lists what it converted",
			`{"allowedTools":["fs_read"],"keyboardShortcut":"ctrl+o","kiroUpgrade":{"v":1},"permissions":{}}`, ReadyV3, 1, 1, true},
		{"the AWS tool isn't carried over", `{"tools":["use_aws","fs_read"],"permissions":{}}`, NeedsUpgrade, 1, 1, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			o := ordered.New()
			_ = o.UnmarshalJSON([]byte(c.spec))
			r := readiness(filepath.Join(t.TempDir(), "a.json"), o, formatJSON)
			if r.State != c.state || len(r.Converted) != c.converted || len(r.NotCarried) != c.lost || r.Universal != c.universal || !r.Upgradable {
				t.Errorf("%+v", r)
			}
		})
	}
	o := ordered.New()
	if r := readiness("x.md", o, formatMarkdown); r.Upgradable {
		t.Error("markdown agents are not upgradable by Kiro's command")
	}
	o = ordered.New()
	_ = o.UnmarshalJSON([]byte(`{"toolAliases":{"@a/search":"kb_search","@a/read":"kb_read"},"keyboardShortcut":"ctrl+o"}`))
	r := readiness("a.json", o, formatJSON)
	if !strings.Contains(r.NotCarried[0], "kb_read, kb_search") || !strings.Contains(r.NotCarried[1], "ctrl+o") {
		t.Errorf("not carried names the aliases and the shortcut: %q", r.NotCarried)
	}
}

func TestParseDryRun(t *testing.T) {
	out := "Dry run — no files written · agents in /x\n" +
		"  ✗ error          bad.json           Invalid JSON: EOF while parsing a list at line 1 column 25\n" +
		"  = unchanged      game-builder.json  already universal\n" +
		"  ↷ skipped        notagent.json      not an agent config\n" +
		"  ✓ would upgrade  orchestrator.json\n" +
		"  ↷ skipped        edited.json        out of sync (not rebuilt)\n" +
		"  = unchanged      v3only.json        v3-only\n\n" +
		"2 would upgrade · 4 unchanged/skipped · 1 error\n"
	got := parseDryRun(out)
	want := map[string]string{"bad.json": "error", "game-builder.json": "universal", "notagent.json": "skipped",
		"orchestrator.json": "upgrade", "edited.json": "out-of-sync", "v3only.json": "v3-only"}
	if len(got) != len(want) {
		t.Fatalf("%v", got)
	}
	for f, st := range want {
		if got[f][0] != st {
			t.Errorf("%s: %v, want %s", f, got[f], st)
		}
	}
	if !strings.HasPrefix(got["bad.json"][1], "Invalid JSON") {
		t.Errorf("the error detail is kept: %v", got["bad.json"])
	}
	if r := withKiroState(Readiness{State: ReadyV3, Universal: true}, [2]string{"upgrade", ""}); r.State != NeedsUpgrade {
		t.Errorf("a universal agent whose 2.x settings changed needs a refresh: %+v", r)
	}
}

func TestKiroStateInList(t *testing.T) {
	svc, dir := newTestService(t)
	_ = os.WriteFile(filepath.Join(dir, "old.json"), []byte(legacySpec), 0o644)
	calls := 0
	svc.cli.Exec = func(_ context.Context, _ string, args ...string) (kirocli.Result, error) {
		calls++
		// Kiro CLI 2.34 prints the report on stderr.
		return kirocli.Result{ExitCode: 1, Stderr: []byte("  ↷ skipped        old.json  out of sync (not rebuilt)\n")}, nil
	}
	list := svc.List()
	if len(list) != 1 || list[0].V3.Kiro != "out-of-sync" || list[0].V3.KiroDetail != "out of sync (not rebuilt)" {
		t.Fatalf("%+v", list)
	}
	svc.List()
	if calls != 1 {
		t.Errorf("the dry run is cached until a file changes: %d calls", calls)
	}
	time.Sleep(10 * time.Millisecond)
	_ = os.WriteFile(filepath.Join(dir, "old.json"), []byte(legacySpec+" "), 0o644)
	svc.List()
	if calls != 2 {
		t.Errorf("a changed file asks Kiro again: %d calls", calls)
	}
	svc.cli.Exec = func(context.Context, string, ...string) (kirocli.Result, error) {
		return kirocli.Result{ExitCode: 2, Stderr: []byte("error: unrecognized subcommand 'upgrade'")}, nil
	}
	_ = os.WriteFile(filepath.Join(dir, "old.json"), []byte(legacySpec), 0o644)
	if l := svc.List(); l[0].V3.Kiro != "" || l[0].V3.State != BlockedOnV3 {
		t.Errorf("an old kiro-cli: no Kiro state, the app's own reading stays: %+v", l[0].V3)
	}
}

func TestUpgradeFlow(t *testing.T) {
	svc, dir := newTestService(t)
	path := filepath.Join(dir, "old.json")
	_ = os.WriteFile(path, []byte(legacySpec), 0o644)

	prev, err := svc.PreviewUpgrade("old")
	if err != nil || !prev.Changed || !strings.Contains(prev.After, "kiroUpgrade") || strings.Contains(prev.Output, os.TempDir()+"/cckiro") {
		t.Fatalf("preview: %+v %v", prev, err)
	}
	if data, _ := os.ReadFile(path); string(data) != legacySpec {
		t.Fatal("preview must not touch the agent file")
	}
	if lastArgs[len(lastArgs)-1] != "--no-backup" {
		t.Errorf("preview runs on a private copy without backups: %v", lastArgs)
	}

	if _, err := svc.ApplyUpgrade("old", "stale"); err == nil || !strings.Contains(err.Error(), "changed since") {
		t.Fatalf("stale hash must be refused: %v", err)
	}
	backup, err := svc.ApplyUpgrade("old", prev.Hash)
	if err != nil || filepath.Base(backup) != "old.json.bak" {
		t.Fatalf("apply: %q %v", backup, err)
	}
	if data, _ := os.ReadFile(backup); string(data) != legacySpec {
		t.Fatal("backup must hold the original")
	}
	list := svc.List()
	if len(list) != 1 || list[0].V3.State != ReadyV3 || !list[0].V3.Universal || list[0].V3.Backup != backup {
		t.Fatalf("after upgrade: %+v (backups are not listed as agents)", list)
	}

	if err := svc.RestoreBackup("old"); err != nil {
		t.Fatal(err)
	}
	if data, _ := os.ReadFile(path); string(data) != legacySpec {
		t.Fatal("restore must bring the original back byte for byte")
	}
	if _, err := os.Stat(backup); !errors.Is(err, os.ErrNotExist) {
		t.Error("the restored backup is removed, as with Kiro's documented rename")
	}
	if err := svc.RestoreBackup("old"); err == nil {
		t.Error("restoring with no backup is an error")
	}
}

func TestUpgradeEdgeCases(t *testing.T) {
	svc, dir := newTestService(t)
	_ = os.WriteFile(filepath.Join(dir, "md.md"), []byte("---\nname: md\n---\nhi"), 0o644)
	if _, err := svc.PreviewUpgrade("md"); err == nil || !strings.Contains(err.Error(), "JSON") {
		t.Errorf("markdown: %v", err)
	}
	_ = os.WriteFile(filepath.Join(dir, "a.json"), []byte(legacySpec), 0o644)
	_ = os.WriteFile(filepath.Join(dir, "a.json.bak"), []byte("{}"), 0o644)
	if got := nextBackup(filepath.Join(dir, "a.json")); filepath.Base(got) != "a.json.bak.1" {
		t.Errorf("numbered backup: %s", got)
	}
	upgradeUnsupported = true
	defer func() { upgradeUnsupported = false }()
	_, err := svc.PreviewUpgrade("a")
	var p interface{ Error() string }
	if err == nil || !strings.Contains(err.Error(), "doesn't support") {
		t.Errorf("old kiro-cli: %v %v", err, p)
	}
	upgradeUnsupported = false
	out, err := svc.UpgradeScope(true)
	if err != nil || !strings.Contains(out, dir) || lastArgs[len(lastArgs)-1] != "--dry-run" {
		t.Errorf("scope dry run: %q %v %v", out, err, lastArgs)
	}
}
