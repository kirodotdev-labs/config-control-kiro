package agent

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kiromanager/internal/shared/ordered"
	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

// newTestService returns a service rooted in a temp KIRO_HOME and its agents dir.
func newTestService(t *testing.T) (*AgentService, string) {
	t.Helper()
	home := t.TempDir()
	t.Setenv("KIRO_HOME", home)
	logger := utils.NewLogger()
	dir := filepath.Join(home, "agents")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	kiro := system.NewKiroService(logger, "test")
	return NewAgentService(kiro, logger, fakeUpgrader(t) /* 2.x */, &fakeMeasurer{kiro: kiro}), dir
}

// fakeMeasurer measures every server as one 10-token tool, except those
// whose command is "broken", and records what it was asked for.
type fakeMeasurer struct {
	kiro  *system.KiroService
	asked []string
}

func (f *fakeMeasurer) MeasureTools(servers map[string]system.MCPLaunch) map[string]string {
	failed := map[string]string{}
	for name, launch := range servers {
		f.asked = append(f.asked, name)
		if launch.Command == "broken" {
			failed[name] = "command not found"
			f.kiro.MCPSizes().RecordFailure(name, launch, failed[name])
			continue
		}
		_ = f.kiro.MCPSizes().Record(name, launch, system.MCPSize{Tools: map[string]int{"t": 10}})
	}
	return failed
}

func mustObject(t *testing.T, s string) *ordered.Object {
	t.Helper()
	o := ordered.New()
	if err := json.Unmarshal([]byte(s), o); err != nil {
		t.Fatal(err)
	}
	return o
}

func TestUpdatePreservesOrderUnknownFieldsAndDeletions(t *testing.T) {
	svc, dir := newTestService(t)
	original := `{"name":"x","zeta":{"b":1,"a":2},"description":"old","welcomeMessage":"hi","futureKey":true}`
	_ = os.WriteFile(filepath.Join(dir, "x.json"), []byte(original), 0o644)

	spec, err := svc.Get("x")
	if err != nil {
		t.Fatal(err)
	}
	_ = spec.Set("description", "new")
	spec.Delete("welcomeMessage")
	if err := svc.Update("x", spec); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(filepath.Join(dir, "x.json"))
	got := mustObject(t, string(data))
	if strings.Join(got.Keys(), ",") != "name,zeta,description,futureKey" {
		t.Errorf("key order/deletion wrong: %v", got.Keys())
	}
	if !strings.Contains(string(data), `"b": 1,`) || got.String("description") != "new" {
		t.Errorf("nested order or edit lost:\n%s", data)
	}
}

func TestIDMayDifferFromName(t *testing.T) {
	svc, dir := newTestService(t)
	_ = os.WriteFile(filepath.Join(dir, "Team-agent.json"), []byte(`{"name":"agent","tools":["a","b"]}`), 0o644)
	list := svc.List()
	if len(list) != 1 || list[0].ID != "Team-agent" || list[0].Name != "agent" || list[0].ToolCount != 2 {
		t.Fatalf("summary: %+v", list)
	}
	spec, _ := svc.Get("Team-agent")
	_ = spec.Set("description", "d")
	if err := svc.Update("Team-agent", spec); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, "agent.json")); err == nil {
		t.Error("update must write the existing file, not create one named after the name field")
	}
}

func TestMarkdownRoundTrip(t *testing.T) {
	svc, dir := newTestService(t)
	src := "---\nname: md\nmodel: auto\ntools:\n  - read\n---\nYou are helpful.\n"
	path := filepath.Join(dir, "md.md")
	_ = os.WriteFile(path, []byte(src), 0o644)

	spec, err := svc.Get("md")
	if err != nil || spec.String("prompt") != "You are helpful.\n" {
		t.Fatalf("prompt from body: %q %v", spec.String("prompt"), err)
	}
	if err := svc.Update("md", spec); err != nil {
		t.Fatal(err)
	}
	if data, _ := os.ReadFile(path); string(data) != src {
		t.Errorf("unchanged markdown agent must round-trip exactly:\n%q\n%q", src, data)
	}
	_ = spec.Set("prompt", "New prompt")
	_ = svc.Update("md", spec)
	data, _ := os.ReadFile(path)
	if !strings.HasSuffix(string(data), "---\nNew prompt\n") || strings.Contains(string(data), "prompt:") {
		t.Errorf("prompt must stay in the body:\n%s", data)
	}
}

func TestUnsupportedFrontmatterIsPreserved(t *testing.T) {
	svc, dir := newTestService(t)
	src := "---\nname: x\nweird: |\n  multi\n  line\n---\nbody\n"
	path := filepath.Join(dir, "x.md")
	_ = os.WriteFile(path, []byte(src), 0o644)
	spec, err := svc.Get("x")
	if err != nil {
		t.Fatal(err)
	}
	_ = spec.Set("prompt", "changed")
	if err := svc.Update("x", spec); err != nil {
		t.Fatal(err)
	}
	if data, _ := os.ReadFile(path); !strings.Contains(string(data), "weird: |\n  multi\n  line\n") {
		t.Errorf("verbatim frontmatter lost:\n%s", data)
	}
}

func TestCreateDeleteAndErrors(t *testing.T) {
	svc, dir := newTestService(t)
	if _, err := svc.Create(mustObject(t, `{"description":"no name"}`)); err == nil {
		t.Error("create without name should fail")
	}
	id, err := svc.Create(mustObject(t, `{"name":"new-agent","tools":["*"]}`))
	if err != nil || id != "new-agent" {
		t.Fatalf("create: %q %v", id, err)
	}
	if _, err := svc.Create(mustObject(t, `{"name":"new-agent"}`)); err == nil {
		t.Error("duplicate create should fail")
	}
	if names := svc.AllNames(); len(names) != 1 || names[0] != "new-agent" {
		t.Errorf("AllNames: %v", names)
	}
	if err := svc.Delete("new-agent"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, "new-agent.json")); !os.IsNotExist(err) {
		t.Error("file should be deleted")
	}
	for _, bad := range []string{"missing", "../../etc/passwd", ""} {
		if _, err := svc.Get(bad); err == nil {
			t.Errorf("Get(%q) should fail", bad)
		}
	}
}

func TestJSONPreferredOverMarkdown(t *testing.T) {
	svc, dir := newTestService(t)
	_ = os.WriteFile(filepath.Join(dir, "dup.json"), []byte(`{"name":"from-json"}`), 0o644)
	_ = os.WriteFile(filepath.Join(dir, "dup.md"), []byte("---\nname: from-md\n---\n"), 0o644)
	if list := svc.List(); len(list) != 1 || list[0].Name != "from-json" {
		t.Errorf("list: %+v", list)
	}
}

func TestPromptOnlyEditKeepsFrontmatterText(t *testing.T) {
	svc, dir := newTestService(t)
	src := "---\nname: md\ntools:\n  - read\n---\nold\n"
	path := filepath.Join(dir, "md.md")
	_ = os.WriteFile(path, []byte(src), 0o644)
	spec, _ := svc.Get("md")
	_ = spec.Set("prompt", "new")
	if err := svc.Update("md", spec); err != nil {
		t.Fatal(err)
	}
	if data, _ := os.ReadFile(path); string(data) != "---\nname: md\ntools:\n  - read\n---\nnew\n" {
		t.Errorf("frontmatter text must be untouched:\n%q", data)
	}
}

func TestUnchangedUpdateDoesNotRewriteFile(t *testing.T) {
	svc, dir := newTestService(t)
	path := filepath.Join(dir, "c.json")
	compact := `{"name":"c","tools":["a"]}`
	_ = os.WriteFile(path, []byte(compact), 0o644)
	spec, _ := svc.Get("c")
	if err := svc.Update("c", spec); err != nil {
		t.Fatal(err)
	}
	if data, _ := os.ReadFile(path); string(data) != compact {
		t.Errorf("no-op save must not reformat the file: %s", data)
	}
}
