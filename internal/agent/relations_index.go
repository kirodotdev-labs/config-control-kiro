package agent

import (
	"os"
	"path/filepath"
	"strings"

	"kiromanager/internal/system"
)

// scopeIndex is a snapshot of the active scope used to answer one relations
// query: every file the navigator shows, the agents to scan, and what Kiro
// gives every agent by default.
type scopeIndex struct {
	home, root      string            // user home; workspace root ("" in Global)
	globalHome      string            // ~/.kiro (or KIRO_HOME)
	pathOf          map[string]string // navigator id -> file path
	idOf            map[string]string // file path -> navigator id
	agents          []agentFile
	servers         map[string]string    // server name -> navigator id, for servers in this scope's mcp.json
	serverDefs      map[string]serverDef // this scope's mcp.json servers
	globalServers   map[string]serverDef // Global mcp.json servers a Workspace agent can get (not rows)
	always          map[string]bool      // navigator ids Kiro sends in full with every message (always-on steering, AGENTS.md)
	sizes           *system.MCPSizes     // measured MCP server sizes
	untrusted       bool                 // an untrusted Workspace: its servers aren't started automatically
	inherits        bool                 // false when chat.disableInheritingDefaultResources is set
	inheritable     map[string]string    // navigator id -> why every agent gets it (default resources)
	applies         map[string]string    // navigator id -> why it governs every agent (hooks, rules, sandbox)
	globalInherited string               // summary of inherited Global files outside this tree
}

// agentFile is one agent spec on disk.
type agentFile struct {
	id, path string
	inTree   bool // shown in the active scope's navigator
}

func newScopeIndex(kiro *system.KiroService) *scopeIndex {
	home, _ := os.UserHomeDir()
	x := &scopeIndex{
		home: home, globalHome: kiro.GlobalConfigPath(),
		pathOf: map[string]string{}, idOf: map[string]string{}, inheritable: map[string]string{}, applies: map[string]string{},
		servers: map[string]string{}, always: map[string]bool{}, sizes: kiro.MCPSizes(),
		serverDefs: readServerDefs(kiro.MCPConfigPath()),
		untrusted:  kiro.WorkspaceTrust() == system.TrustUntrusted,
	}
	workspace := kiro.GetMode() == system.ModeWorkspace
	if workspace {
		x.root = kiro.GetActiveWorkspace()
	}
	for _, n := range kiro.Surfaces() {
		x.index(n)
	}
	x.agents = agentsIn(kiro.AgentsDir(), true)
	if workspace {
		x.agents = append(x.agents, agentsIn(kiro.GlobalAgentsDir(), false)...)
		x.globalServers = readServerDefs(filepath.Join(x.globalHome, "settings", "mcp.json"))
	}
	x.inherits = !disablesInheritance(filepath.Join(x.globalHome, "settings", "cli.json"), filepath.Join(kiro.GetConfigPath(), "settings", "cli.json"))
	if workspace {
		x.globalInherited = summarizeGlobal(x.globalHome)
	}
	return x
}

// index records n and its children. Steering (unless manual) and skills are
// default resources every agent inherits; hook files, permission rules and
// the sandbox govern every agent regardless of that setting.
func (x *scopeIndex) index(n *system.SurfaceNode) {
	if n.Kind == system.KindMCPServer { // shares mcp.json's path, so it has no path entry
		x.servers[n.Name] = n.ID
		return
	}
	switch {
	case n.Kind == system.KindPermissions && n.Exists:
		x.applies[n.ID] = "applies to every agent: permission rules"
	case n.Kind == system.KindSandbox && n.Exists:
		x.applies[n.ID] = "applies to every agent: command sandbox"
	case n.Kind == system.KindKiroignore && n.Exists:
		x.applies[n.ID] = "applies to every agent: files Kiro must not read"
	}
	isGroup := n.Kind == system.KindAgents || n.Kind == system.KindHooks || n.Kind == system.KindSteering || n.Kind == system.KindSkills || n.Kind == system.KindPrompts
	if !isGroup && n.Path != "" {
		x.pathOf[n.ID] = n.Path
		x.idOf[pathKey(n.Path)] = n.ID
	}
	for _, c := range n.Children {
		x.index(c)
		switch n.Kind {
		case system.KindKiroignore:
			x.applies[c.ID] = "applies to every agent: files Kiro must not read"
		case system.KindSteering:
			if strings.HasPrefix(c.ID, "agentsmd:") {
				x.inheritable[c.ID] = "inherited: AGENTS.md (always included)"
				x.always[c.ID] = true
			} else if mode := steeringInclusion(c.Path); mode != "manual" {
				x.inheritable[c.ID] = "inherited: " + mode + " steering"
				x.always[c.ID] = mode == "always"
			}
		case system.KindSkills:
			x.inheritable[c.ID] = "inherited: skill"
		case system.KindHooks:
			x.applies[c.ID] = "applies to every agent: hook file"
		}
	}
}

func agentsIn(dir string, inTree bool) []agentFile {
	var out []agentFile
	for _, f := range specFiles(dir) {
		out = append(out, agentFile{id: stem(f), path: filepath.Join(dir, f), inTree: inTree})
	}
	return out
}

// target is a reference resolved to a filesystem path or pattern.
type target struct {
	path     string // absolute path or glob
	glob     bool
	resolved bool   // false for relative paths with no fixed base
	note     string // why it is not in the tree
}

// resolve turns a file:// or skill:// URI (or a bare path) into a target.
// Relative paths resolve against base; with no base (a Global agent) they
// depend on where Kiro is started, so they stay unresolved.
func (x *scopeIndex) resolve(uri, base string) target {
	p := uri
	for _, scheme := range []string{"file://", "skill://"} {
		p = strings.TrimPrefix(p, scheme)
	}
	switch {
	case p == "~/.kiro" || strings.HasPrefix(p, "~/.kiro/"):
		// Kiro's own folder: the configured global home (KIRO_HOME may move it off ~).
		p = filepath.Join(x.globalHome, strings.TrimPrefix(p, "~/.kiro"))
	case p == "~" || strings.HasPrefix(p, "~/"):
		p = filepath.Join(x.home, strings.TrimPrefix(p, "~"))
	case filepath.IsAbs(p):
	case base != "":
		p = filepath.Join(base, p)
	default:
		return target{path: p, note: "relative to the folder Kiro starts in"}
	}
	t := target{path: filepath.Clean(p), glob: strings.ContainsAny(p, "*?["), resolved: true}
	if !t.glob {
		if _, err := os.Stat(t.path); err != nil {
			t.note = "file not found"
		} else {
			t.note = "outside this scope"
		}
	} else {
		t.note = "no matching files in this scope"
	}
	return t
}

// match returns the navigator ids of the files t points at.
func (x *scopeIndex) match(t target) []string {
	if !t.resolved {
		return nil
	}
	if !t.glob {
		if id, ok := x.idOf[pathKey(t.path)]; ok {
			return []string{id}
		}
		return nil
	}
	var ids []string
	for path, id := range x.idOf {
		if globMatch(pathKey(t.path), path) {
			ids = append(ids, id)
		}
	}
	return ids
}
