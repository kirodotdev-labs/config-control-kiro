package workflows

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

// install copies a fixture run (captured from a real Kiro CLI V3 run) into home, placed in workspace.
func install(t *testing.T, home, key, id, fixture, workspace string, withDefinition bool) { // id names the folder; the fixture holds the same id
	t.Helper()
	dir := filepath.Join(home, "sessions", key, "workflows", id)
	_ = os.MkdirAll(dir, 0o755)
	data, err := os.ReadFile(filepath.Join("testdata", fixture))
	if err != nil {
		t.Fatal(err)
	}
	text := strings.ReplaceAll(string(data), "{{WS}}", filepath.ToSlash(workspace))
	_ = os.WriteFile(filepath.Join(dir, "workflow-state.json"), []byte(text), 0o600)
	if withDefinition {
		def, _ := os.ReadFile(filepath.Join("testdata", "definition.json"))
		_ = os.WriteFile(filepath.Join(dir, "workflow-definition.json"), def, 0o600)
	}
}

func TestRunsAreReadAndScoped(t *testing.T) {
	home := t.TempDir()
	t.Setenv("KIRO_HOME", home)
	kiro := system.NewKiroService(utils.NewLogger(), "test")
	svc := NewService(kiro)
	proj, other := t.TempDir(), t.TempDir()
	install(t, home, "a98f5fc12e894ee9", "wf_f18b906fdb20b966", "run-completed.state.json", proj, true)
	install(t, home, "a98f5fc12e894ee9", "wf_98322c6ac7ea9edc", "run-stuck.state.json", other, false)
	_ = os.MkdirAll(filepath.Join(home, "sessions", "a98f5fc12e894ee9", "workflows", "wf_broken"), 0o755) // no state: skipped

	runs := svc.List()
	if len(runs) != 2 {
		t.Fatalf("Global lists every run: %+v", runs)
	}
	done := runs[0] // newest first
	if done.Resume != "kiro-cli chat --v3 --resume-id sess_316e4dd5-065e-450f-96c3-679c2e6004b8" {
		t.Errorf("resume command for the parent chat: %q", done.Resume)
	}
	if runs[1].Status != "paused" {
		t.Errorf("the older run: %+v", runs[1])
	}
	if done.ID != "wf_f18b906fdb20b966" || done.Name != "investigate" || done.Status != "completed" || done.Steps != 1 || done.StepsDone != 1 {
		t.Errorf("completed run summary: %+v", done)
	}

	if err := kiro.SetWorkspace(proj); err != nil {
		t.Fatal(err)
	}
	if runs := svc.List(); len(runs) != 1 || runs[0].ID != "wf_f18b906fdb20b966" {
		t.Errorf("a Workspace lists only its own runs: %+v", runs)
	}

	d, err := svc.Get("wf_f18b906fdb20b966")
	if err != nil {
		t.Fatal(err)
	}
	if d.Artifacts["report"] == "" || d.Outputs["investigate"] == "" || len(d.Root.Children) != 1 || d.Root.Children[0].AgentName != "wf-planner" ||
		d.Root.Children[0].Signal != "success" || len(d.Definition) == 0 || len(d.Request) != 1 {
		t.Errorf("detail: %+v", d)
	}
	for _, bad := range []string{"../etc", "wf_../x", ""} {
		if _, err := svc.Get(bad); err == nil {
			t.Errorf("%q must be refused", bad)
		}
	}
	if _, err := svc.Get("wf_nope"); err == nil {
		t.Error("an unknown run is a 404")
	}
}
