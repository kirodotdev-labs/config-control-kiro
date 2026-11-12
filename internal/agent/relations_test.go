package agent

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kiromanager/internal/system"
)

// relationsFixture builds a Global scope with steering, a skill, mcp.json and
// three agents that reference them in different ways.
func relationsFixture(t *testing.T) (*AgentService, string) {
	t.Helper()
	svc, agents := newTestService(t)
	home := filepath.Dir(agents)
	files := map[string]string{
		"steering/style.md":         "# style",
		"steering/team/ops.md":      "---\ninclusion: auto\n---\n# ops",
		"steering/guide.md":         "---\ninclusion: manual\n---\n# guide",
		"skills/deploy/SKILL.md":    "---\nname: deploy\n---\n",
		"settings/mcp.json":         `{"mcpServers":{"git":{"command":"git-mcp"},"web":{"url":"http://x"},"off":{"command":"x","disabled":true}}}`,
		"settings/permissions.yaml": "rules: []\n",
		"hooks/lint.json":           `{"version":"v1","hooks":[]}`,
		"prompts/a.md":              "You are a.",
		"agents/a.json": `{"name":"a","includeMcpJson":true,"tools":["read","@git","@off"],"mcpServers":{"own":{"command":"own-mcp"}},"prompt":"file://../prompts/a.md","resources":[
			"file://` + home + `/steering/**/*.md","skill://` + home + `/skills/*/SKILL.md","file://README.md",
			{"type":"knowledgeBase","name":"docs","source":"file:///nonexistent/docs"}]}`,
		"agents/b.json": `{"name":"b","resources":["file://` + home + `/steering/style.md"]}`,
		"agents/c.md":   "---\nname: c\n---\nPlain.",
		"agents/d.json": `{"name":"d","tools":["read","@git/status","@we*"],"mcpServers":{"git":{"command":"git-mcp"},"web":{"url":"http://x"},"zz":{"command":"z"}}}`,
	}
	for rel, data := range files {
		p := filepath.Join(home, rel)
		_ = os.MkdirAll(filepath.Dir(p), 0o755)
		if err := os.WriteFile(p, []byte(data), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return svc, home
}

func linkMap(r Relations) map[string]Link {
	m := map[string]Link{}
	for _, l := range r.Links {
		m[l.ID] = l
	}
	return m
}

func TestRelationsOfAgent(t *testing.T) {
	svc, _ := relationsFixture(t)

	t.Run("listed references, globs and includeMcpJson", func(t *testing.T) {
		got := svc.Relations("agent:a")
		links := linkMap(got)
		for _, id := range []string{"steering:style.md", "steering:team/ops.md", "steering:guide.md", "skill:deploy", "mcp", "prompts:a.md"} {
			if l, ok := links[id]; !ok || l.Inherited {
				t.Errorf("missing explicit link %s: %+v", id, got.Links)
			}
		}
		notes := map[string]string{}
		for _, o := range got.Other {
			notes[o.Via] = o.Note
		}
		if notes["resources"] != "relative to the folder Kiro starts in" || notes["knowledge base docs"] != "file not found" {
			t.Errorf("other: %+v", got.Other)
		}
	})

	t.Run("agent with no resources inherits steering and skills, not manual steering", func(t *testing.T) {
		links := linkMap(svc.Relations("agent:c"))
		for _, id := range []string{"steering:style.md", "steering:team/ops.md", "skill:deploy"} {
			if !links[id].Inherited {
				t.Errorf("%s should be inherited: %+v", id, links)
			}
		}
		if _, ok := links["steering:guide.md"]; ok {
			t.Error("manual steering is not inherited")
		}
	})
}

func TestRelationsToMCPServers(t *testing.T) {
	svc, _ := relationsFixture(t)

	t.Run("includeMcpJson gives every server in mcp.json, whatever tools says", func(t *testing.T) {
		got := svc.Relations("agent:a")
		links := linkMap(got)
		for _, id := range []string{"mcpserver:git", "mcpserver:web"} {
			if l := links[id]; l.Unused || l.Context == nil || !l.Context.Unmeasured {
				t.Errorf("%s is used and not measured yet: %+v", id, l)
			}
		}
		if l := links["mcpserver:off"]; l.Context != nil || !l.Unused || !strings.Contains(l.Via, "Turned off") {
			t.Errorf("off is turned off: %+v", l)
		}
		own := false
		for _, o := range got.Other {
			own = own || (o.Label == "MCP server own" && !o.Unused && o.Context != nil)
		}
		if !own {
			t.Errorf("the agent's own server, with no row, is under Other: %+v", got.Other)
		}
	})

	t.Run("an agent's own server joins the row of the same name", func(t *testing.T) {
		got := svc.Relations("agent:d")
		links := linkMap(got)
		if l := links["mcpserver:git"]; l.Unused || !strings.Contains(l.Via, "this agent's own mcpServers") {
			t.Errorf("git, granted by @git/status: %+v", l)
		}
		if l := links["mcpserver:web"]; l.Unused {
			t.Errorf("web, granted by @we*: %+v", l)
		}
		if _, ok := links["mcpserver:off"]; ok {
			t.Error("d doesn't include mcp.json, so it doesn't get off")
		}
		zz := false
		for _, o := range got.Other {
			zz = zz || (o.Label == "MCP server zz" && o.Unused && o.Context == nil)
		}
		if !zz {
			t.Errorf("zz has no row and none of its tools are in d's tools: %+v", got.Other)
		}
	})

	if git := linkMap(svc.Relations("mcpserver:git")); git["agent:a"].Unused || git["agent:d"].Unused || len(git) != 2 {
		t.Errorf("git is used by a and d: %+v", git)
	}
}

func TestMCPServerContext(t *testing.T) {
	svc, _ := relationsFixture(t)
	if err := svc.kiro.MCPSizes().Record("git", system.MCPLaunch{Command: "git-mcp"}, system.MCPSize{Tools: map[string]int{"status": 100, "log": 40, "push": 7}}); err != nil {
		t.Fatal(err)
	}
	if c := linkMap(svc.Relations("agent:a"))["mcpserver:git"].Context; c == nil || c.Unmeasured || c.Tokens != 147 || c.Tools != 3 {
		t.Errorf("includeMcpJson sends every tool: %+v", c)
	}
	if c := linkMap(svc.Relations("agent:d"))["mcpserver:git"].Context; c == nil || c.Tokens != 100 || c.Tools != 1 {
		t.Errorf("@git/status sends one tool: %+v", c)
	}
	if _, ok := svc.kiro.MCPSizes().Lookup("git", system.MCPLaunch{Command: "other"}); ok {
		t.Error("a size belongs to one launch; a changed command must be measured again")
	}
}

func TestToolPicker(t *testing.T) {
	p := toolPicker{tools: []string{"@git/st*", "@docs", "@mcp_*"}, excluded: []string{"@docs/delete", "@git/sta?e"}}
	for _, tc := range []struct {
		server, tool string
		want         bool
	}{
		{"git", "status", true}, {"git", "stage", false}, {"git", "log", false},
		{"docs", "read", true}, {"docs", "delete", false}, {"web", "get", false},
	} {
		if got := p.picks(tc.server, tc.tool); got != tc.want {
			t.Errorf("picks(%s, %s) = %v, want %v", tc.server, tc.tool, got, tc.want)
		}
	}
	if !p.mayPick("git") || !p.mayPick("docs") || p.mayPick("web") {
		t.Error("mayPick")
	}
	if !(toolPicker{tools: []string{"@*/search"}}).mayPick("web") || !(toolPicker{all: true}).picks("x", "y") {
		t.Error("a wildcard server name, and all")
	}
	if (toolPicker{all: true, excluded: []string{"@git"}}).mayPick("git") || (toolPicker{all: true, excluded: []string{"@git"}}).picks("git", "log") {
		t.Error("excludedTools @git takes the whole server away")
	}
	if !(toolPicker{tools: []string{"mcp_git_*"}}).picks("git", "log") {
		t.Error("Kiro's tool id matches too")
	}
}

func TestRelationsToPowers(t *testing.T) {
	svc, home := relationsFixture(t)
	_ = os.WriteFile(filepath.Join(home, "agents", "pw.json"), []byte(`{"name":"pw","includePowers":true}`), 0o644)
	if l := linkMap(svc.Relations("agent:pw"))["powers"]; !strings.Contains(l.Via, "includePowers") {
		t.Errorf("an agent with includePowers links to Powers: %+v", l)
	}
	if _, ok := linkMap(svc.Relations("agent:b"))["powers"]; ok {
		t.Error("b doesn't include powers")
	}
	if p := linkMap(svc.Relations("powers")); len(p) != 1 || p["agent:pw"].ID == "" {
		t.Errorf("Powers links to the agents that include them: %+v", p)
	}
	ws := t.TempDir()
	_ = os.MkdirAll(filepath.Join(ws, ".kiro", "agents"), 0o755)
	_ = os.WriteFile(filepath.Join(ws, ".kiro", "agents", "wp.json"), []byte(`{"name":"wp","includePowers":true}`), 0o644)
	if err := svc.kiro.SetWorkspace(ws); err != nil {
		t.Fatal(err)
	}
	found := false
	for _, o := range svc.Relations("agent:wp").Other {
		found = found || o.Label == "Global powers"
	}
	if !found {
		t.Error("in a Workspace, the Global powers are an Other row")
	}
}

func TestContextOfFiles(t *testing.T) {
	svc, _ := relationsFixture(t)

	a := linkMap(svc.Relations("agent:a"))
	if c := a["steering:style.md"].Context; c == nil || c.Tokens != 2 {
		t.Errorf("a listed file counts in full, characters/4 rounded up (\"# style\" = 7): %+v", c)
	}
	if c := a["prompts:a.md"].Context; c == nil || c.Tokens != 3 {
		t.Errorf("the prompt file counts in full: %+v", c)
	}
	if a["skill:deploy"].Context != nil || a["hooks:lint.json"].Context != nil || a["permissions"].Context != nil {
		t.Errorf("skills load on demand; hooks and rules aren't sent: %+v", a)
	}
	c := linkMap(svc.Relations("agent:c"))
	if c["steering:style.md"].Context == nil || c["steering:team/ops.md"].Context != nil || c["skill:deploy"].Context != nil {
		t.Errorf("inherited: always-on steering counts; auto steering and skills don't: %+v", c)
	}
	if got := system.KiroTokens("héllo 👋!"); got != 3 {
		t.Errorf("KiroTokens counts UTF-16 units like JavaScript (9 → 3), got %d", got)
	}
}

func TestRelationsOfFile(t *testing.T) {
	svc, home := relationsFixture(t)

	links := linkMap(svc.Relations("steering:style.md"))
	if links["agent:a"].Via != "resources" || links["agent:b"].Via != "resources" || !links["agents"].Inherited {
		t.Errorf("style.md: %+v", links)
	}
	if _, ok := links["agent:c"]; ok {
		t.Error("c does not list style.md; it is covered by the inherited link to the Agents group")
	}
	if guide := linkMap(svc.Relations("steering:guide.md")); len(guide) != 1 || guide["agent:a"].ID == "" {
		t.Errorf("manual steering is used only where listed: %+v", guide)
	}
	if h := linkMap(svc.Relations("hooks:lint.json")); !h["agents"].Inherited {
		t.Errorf("a hook file applies to every agent: %+v", h)
	}
	if mcp := linkMap(svc.Relations("mcp")); mcp["agent:a"].Via != "includeMcpJson" || len(mcp) != 1 {
		t.Errorf("mcp: %+v", mcp)
	}

	_ = os.WriteFile(filepath.Join(home, "settings", "cli.json"), []byte(`{"chat.disableInheritingDefaultResources":true}`), 0o644)
	if c := linkMap(svc.Relations("agent:c")); len(c) != 2 || !c["permissions"].Inherited || !c["hooks:lint.json"].Inherited {
		t.Errorf("with inheritance disabled, only hook files and permissions still apply: %+v", c)
	}
	if empty := svc.Relations("steering"); len(empty.Links)+len(empty.Other) != 0 {
		t.Errorf("groups have no relations: %+v", empty)
	}
}

func TestRelationsFromGlobalAgentInWorkspace(t *testing.T) {
	svc, home := relationsFixture(t)
	_ = os.WriteFile(filepath.Join(home, "agents", "g.json"), []byte(`{"name":"g","resources":["file://.kiro/steering/*.md"]}`), 0o644)
	ws := t.TempDir()
	_ = os.MkdirAll(filepath.Join(ws, ".kiro", "steering"), 0o755)
	_ = os.WriteFile(filepath.Join(ws, ".kiro", "steering", "w.md"), []byte("# w"), 0o644)
	if err := svc.kiro.SetWorkspace(ws); err != nil {
		t.Fatal(err)
	}
	got := svc.Relations("steering:w.md")
	found := false
	for _, o := range got.Other {
		found = found || (o.Label == "Global agent g" && o.Via == "resources")
	}
	if !found {
		t.Errorf("a Global agent using a workspace file shows under Other: %+v", got)
	}
	if !linkMap(got)["agents"].Inherited {
		t.Errorf("workspace steering is inherited: %+v", got.Links)
	}
	summary := svc.Relations("agent:nope")
	if len(summary.Links) != 0 {
		t.Errorf("unknown agent: %+v", summary)
	}
}

func TestGlobMatch(t *testing.T) {
	cases := []struct {
		pattern, path string
		want          bool
	}{
		{"/h/steering/**/*.md", "/h/steering/a.md", true},
		{"/h/steering/**/*.md", "/h/steering/x/y/a.md", true},
		{"/h/steering/*.md", "/h/steering/x/a.md", false},
		{"/h/skills/*/SKILL.md", "/h/skills/deploy/SKILL.md", true},
		{"/h/a?.md", "/h/ab.md", true},
		{"/h/a.md", "/h/a+md", false},
	}
	for _, c := range cases {
		if got := globMatch(c.pattern, c.path); got != c.want {
			t.Errorf("globMatch(%q, %q) = %v", c.pattern, c.path, got)
		}
	}
	if !strings.Contains(pluralize(2, "skill"), "2 skills") {
		t.Error("pluralize")
	}
}

func TestTildeKiroResolvesToTheKiroHome(t *testing.T) {
	// KIRO_HOME moves Kiro's folder off ~, as on a machine whose Kiro home is on another drive.
	// skill://~/.kiro/... (what the app and the docs write) must still find the skill there.
	svc, home := relationsFixture(t)
	_ = os.WriteFile(filepath.Join(home, "agents", "e.json"), []byte(`{"name":"e","resources":["skill://~/.kiro/skills/*/SKILL.md","file://~/.kiro/steering/style.md"]}`), 0o644)
	links := linkMap(svc.Relations("agent:e"))
	if _, ok := links["skill:deploy"]; !ok {
		t.Errorf("skill://~/.kiro/skills/*/SKILL.md must link the skill: %v", links)
	}
	if _, ok := links["steering:style.md"]; !ok {
		t.Errorf("file://~/.kiro/steering/style.md must link the steering file: %v", links)
	}
}

func TestOutsideFilesAreTypedAndGlobsExpanded(t *testing.T) {
	svc, home := relationsFixture(t)
	ext := t.TempDir() // a package somewhere else on disk, like an AIM or team bundle
	for rel, data := range map[string]string{
		"context/design.md":            "# design",
		"skills/report/SKILL.md":       "---\nname: report\ndescription: x\n---\n",
		"skills/export/SKILL.md":       "---\nname: export\ndescription: y\n---\n",
		"skills/export/scripts/run.sh": "echo",
		"assets/logo.png":              "\x89PNG",
	} {
		p := filepath.Join(ext, rel)
		_ = os.MkdirAll(filepath.Dir(p), 0o755)
		_ = os.WriteFile(p, []byte(data), 0o644)
	}
	_ = os.WriteFile(filepath.Join(home, "agents", "f.json"), []byte(`{"name":"f","resources":[
		"file://`+ext+`/context/design.md","skill://`+ext+`/skills/*/SKILL.md","file://`+ext+`/assets/logo.png","file://`+ext+`/gone.md"]}`), 0o644)
	rel := svc.Relations("agent:f")
	kinds := map[string]string{}
	for _, o := range rel.Other {
		kinds[filepath.ToSlash(strings.TrimPrefix(o.Path, ext))] = o.Kind
	}
	want := map[string]string{"/context/design.md": "steering", "/skills/export/SKILL.md": "skill", "/skills/report/SKILL.md": "skill", "/assets/logo.png": "file", "/gone.md": "missing"}
	for p, k := range want {
		if kinds[p] != k {
			t.Errorf("%s: kind %q, want %q (all: %v)", p, kinds[p], k, kinds)
		}
	}
	if len(rel.Other) != len(want) {
		t.Errorf("one row per file, the glob expanded: %d rows", len(rel.Other))
	}
}
