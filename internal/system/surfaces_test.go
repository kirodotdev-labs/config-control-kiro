package system

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSurfaces(t *testing.T) {
	svc := newTestService(t)
	home := svc.GetConfigPath()
	write := func(rel, data string) {
		p := filepath.Join(home, rel)
		_ = os.MkdirAll(filepath.Dir(p), 0o755)
		_ = os.WriteFile(p, []byte(data), 0o644)
	}
	write("agents/b.json", "{}")
	write("agents/a.md", "---\n---\n")
	write("agents/b.md", "---\n---\n") // duplicate id: JSON must win
	write("agents/.hidden.json", "{}")
	write("steering/rules.md", "# r")
	write("steering/team/style.md", "# s")
	write("steering/.hidden/x.md", "# x")
	write("hooks/h.json", "{}")
	write("skills/s1/SKILL.md", "# s")
	write("workflows/review.workflow.yaml", "name: review")
	write("workflows/notes.yaml", "not a recipe")
	write("workflows/data.json", "{}")
	write("specs/login/requirements.md", "# r")
	write("powers/installed/postman/POWER.md", "---\nname: postman\n---\n")
	write("powers/installed/postman/steering/setup.md", "# s")
	write("power-sources/team-api/plugin.json", "{}")
	write("powers/installed/team-api/plugin.json", "{}") // installed from your own: listed once, as yours
	_ = os.MkdirAll(filepath.Join(home, "skills", "no-skill-file"), 0o755)

	byKind := map[string]*SurfaceNode{}
	for _, n := range svc.Surfaces() {
		byKind[n.Kind] = n
	}
	// Powers: installed powers then your own, each a folder with its files.
	var ids []string
	for _, n := range byKind[KindPowers].Children {
		ids = append(ids, n.Kind+" "+n.ID)
		for _, f := range n.Children {
			ids = append(ids, f.ID)
		}
	}
	if got := strings.Join(ids, ","); got != "power power:postman,powerfile:postman/POWER.md,powerfile:postman/steering/setup.md,powersource powersource:team-api,powersourcefile:team-api/plugin.json" {
		t.Errorf("powers: %s", got)
	}
	agents := byKind[KindAgents]
	if agents == nil || len(agents.Children) != 2 || agents.Children[0].Name != "a" || agents.Children[1].Format != "json" {
		t.Fatalf("agents: %+v", agents)
	}
	if agents.Children[0].Kind != KindAgent || agents.Children[0].ID != "agent:a" {
		t.Errorf("agent leaf: %+v", agents.Children[0])
	}
	if s := byKind[KindSteering]; len(s.Children) != 2 || s.Children[0].Kind != KindFile || s.Children[1].Name != "team/style.md" {
		t.Errorf("steering: %+v", s.Children)
	}
	if h := byKind[KindHooks]; len(h.Children) != 1 || h.Children[0].Format != "json" || h.Children[0].Kind != KindHookFile {
		t.Errorf("hooks: %+v", h.Children)
	}
	sk := byKind[KindSkills]
	if len(sk.Children) != 1 || filepath.Base(sk.Children[0].Path) != "SKILL.md" {
		t.Errorf("skills must point at SKILL.md and skip dirs without one: %+v", sk.Children)
	}
	if m := byKind[KindMCP]; m.Exists || m.Format != "json" {
		t.Errorf("mcp: %+v", m)
	}
	if w := byKind[KindWorkflows]; len(w.Children) != 1 || w.Children[0].Format != "yaml" || w.Children[0].Name != "review.workflow.yaml" {
		t.Errorf("workflows: %+v", w)
	}
	if byKind[KindSpecs] != nil || byKind[KindPowers] == nil || byKind[KindSettings] == nil {
		t.Errorf("Global shows Powers and Settings, not Specs: %v", byKind)
	}
	if g := svc.Surfaces(); g[len(g)-1].Kind != KindSessions || g[len(g)-2].Kind != KindACP {
		t.Errorf("Global ends with ACP, then Chats & usage: %s, %s", g[len(g)-2].Kind, g[len(g)-1].Kind)
	}
	ws := t.TempDir()
	write2 := filepath.Join(ws, ".kiro", "specs", "login", "design.md")
	_ = os.MkdirAll(filepath.Dir(write2), 0o755)
	_ = os.WriteFile(write2, []byte("# d"), 0o644)
	if err := svc.SetWorkspace(ws); err != nil {
		t.Fatal(err)
	}
	wsKinds := map[string]*SurfaceNode{}
	for _, n := range svc.Surfaces() {
		wsKinds[n.Kind] = n
	}
	if byKind[KindMemory] == nil || wsKinds[KindMemory] == nil || wsKinds[KindMemory].Path != byKind[KindMemory].Path {
		t.Errorf("Memory is in both scopes, backed by the one Global store: %+v %+v", byKind[KindMemory], wsKinds[KindMemory])
	}
	if l := wsKinds[KindLSP]; l == nil || l.Exists || l.Path != filepath.Join(ws, ".kiro", "settings", "lsp.json") || byKind[KindLSP] != nil {
		t.Errorf("Code intelligence is Workspace only: %+v", l)
	}
	if wsKinds[KindACP] != nil {
		t.Error("ACP is Global only")
	}
	if sp := wsKinds[KindSpecs]; sp == nil || len(sp.Children) != 1 || sp.Children[0].ID != "spec:login" || sp.Children[0].Kind != KindSpec ||
		len(sp.Children[0].Children) != 1 || sp.Children[0].Children[0].ID != "specfile:login/design.md" || wsKinds[KindPowers] != nil {
		t.Errorf("Workspace shows Specs, not Powers: %+v", wsKinds)
	}
	if p := byKind[KindPermissions]; p.Format != "yaml" {
		t.Errorf("permissions: %+v", p)
	}
}
