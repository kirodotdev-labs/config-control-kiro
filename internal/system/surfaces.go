package system

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
)

// Surface kinds. Group kinds hold files; the rest are single-file surfaces or
// individual files. The frontend routes each kind to its editor.
const (
	KindAgents      = "agents"      // group of agent specs
	KindAgent       = "agent"       // one agent spec (id = file stem)
	KindMCP         = "mcp"         // settings/mcp.json
	KindMCPServer   = "mcpserver"   // one server in mcp.json (id "mcpserver:<name>")
	KindPermissions = "permissions" // permissions.yaml
	KindHooks       = "hooks"       // group of hook files
	KindSteering    = "steering"    // group of steering markdown files
	KindSkills      = "skills"      // group of skill packages (SKILL.md each)
	KindSandbox     = "sandbox"     // settings/sandbox.json
	KindWorkflows   = "workflows"   // group of workflow recipes (.json/.yaml)
	KindSpecs       = "specs"       // group of specs (workspace only)
	KindSpec        = "spec"        // one spec's folder, .kiro/specs/<name> (id "spec:<name>", files "specfile:<name>/<rel>")
	KindPowers      = "powers"      // installed powers (global only, managed by Kiro)
	KindPower       = "power"       // one installed power's folder (id "power:<name>")
	KindPowerSource = "powersource" // a power you build, in <global>/power-sources (id "powersource:<name>")
	KindSettings    = "settings"    // settings/cli.json
	KindSessions    = "sessions"    // Kiro CLI chats and their credit usage (read-only)
	KindMemory      = "memory"      // what Kiro V3 remembers across chats (<global>/memories, read-only)
	KindLSP         = "lsp"         // .kiro/settings/lsp.json, language servers for code intelligence (workspace only)
	KindACP         = "acp"         // how other programs connect to Kiro (kiro-cli acp); Global only, no file
	KindKiroignore  = "kiroignore"  // files Kiro must not read (settings/kiroignore or <ws>/.kiroignore)
	KindPrompts     = "prompts"     // group of saved prompts (prompts/*.md)
	KindPolicy      = "policy"      // administrator policy, managed-settings.json (read-only)
	KindHookFile    = "hookfile"    // one standalone hook file (.kiro/hooks/*.json)
	KindFile        = "file"        // a plain file inside a group, edited as text
)

// SurfaceNode is one configuration surface of the active scope, or a file in it.
type SurfaceNode struct {
	ID       string         `json:"id"`                 // stable, unique within the tree
	Name     string         `json:"name"`               // display label (agent id for agents)
	Kind     string         `json:"kind"`               // one of the Kind constants
	Path     string         `json:"path"`               // absolute file or directory path
	Format   string         `json:"format,omitempty"`   // json|yaml|md for files
	Exists   bool           `json:"exists"`             // present on disk
	Disabled bool           `json:"disabled,omitempty"` // present, but Kiro won't start it (a disabled MCP server)
	Children []*SurfaceNode `json:"children,omitempty"`
}

// Surfaces returns the configuration surfaces of the active scope in display order.
// Specs exist only in a Workspace and Powers only in Global, as in
// kiro.dev/docs/configuration.
func (s *KiroService) Surfaces() []*SurfaceNode {
	root := ""
	if s.GetMode() == ModeWorkspace {
		root = s.GetActiveWorkspace()
	}
	steering := deepGroup(KindSteering, "Steering", s.SteeringDir(), ".md")
	ignore := fileSurface(KindKiroignore, "Kiroignore", s.KiroignorePath(), "text")
	if root != "" {
		found := findInWorkspace(root, "AGENTS.md", ".kiroignore")
		for _, rel := range found["AGENTS.md"] {
			steering.Children = append(steering.Children, agentsMDNode(root, rel))
		}
		for _, rel := range found[".kiroignore"] {
			if rel != ".kiroignore" {
				ignore.Children = append(ignore.Children, fileNode("kiroignore:"+rel, rel, filepath.Join(root, filepath.FromSlash(rel))))
			}
		}
	}
	nodes := []*SurfaceNode{
		agentsGroup(s.AgentsDir()),
		mcpSurface(s.MCPConfigPath()),
		fileSurface(KindPermissions, "Permissions", s.PermissionsPath(), "yaml"),
		ignore,
		filesGroup(KindHooks, KindHookFile, "Hooks", s.HooksDir(), ".json"),
		steering,
		skillsGroup(s.SkillsDir()),
		filesGroup(KindPrompts, KindFile, "Prompts", s.PromptsDir(), ".md"),
		// Kiro reads only *.workflow.json|yaml|yml as recipes (kiro.dev/docs/workflows/authoring).
		deepGroup(KindWorkflows, "Workflows", s.WorkflowsDir(), ".workflow.json", ".workflow.yaml", ".workflow.yml"),
	}
	if s.GetMode() == ModeWorkspace {
		nodes = append(nodes, specsGroup(s.SpecsDir()),
			fileSurface(KindLSP, "Code intelligence", s.LSPPath(), "json"))
	} else {
		powers := fileSurface(KindPowers, "Powers", s.PowersInstalledPath(), "json")
		// Each power is a folder with its files under it: Kiro's installed copies,
		// then the powers you build (power-sources), which aren't installed until you install them.
		// A power you build that is also installed shows once, as yours (its page says it's installed).
		sources := filepath.Join(s.globalConfigPath, "power-sources")
		addPowers := func(dir, kind string) {
			entries, _ := os.ReadDir(dir)
			for _, e := range entries {
				if !e.IsDir() || strings.HasPrefix(e.Name(), ".") {
					continue
				}
				if kind == KindPower {
					if st, err := os.Stat(filepath.Join(sources, e.Name())); err == nil && st.IsDir() {
						continue
					}
				}
				pdir := filepath.Join(dir, e.Name())
				n := &SurfaceNode{ID: kind + ":" + e.Name(), Name: e.Name(), Kind: kind, Path: pdir, Exists: true}
				for _, f := range folderFiles(pdir) {
					n.Children = append(n.Children, fileNode(kind+"file:"+e.Name()+"/"+f.Rel, f.Rel, f.Path))
				}
				powers.Children = append(powers.Children, n)
			}
		}
		addPowers(filepath.Join(s.globalConfigPath, "powers", "installed"), KindPower)
		addPowers(sources, KindPowerSource)
		nodes = append(nodes, powers)
		if policy := fileSurface(KindPolicy, "Admin policy", ManagedSettingsPath(runtime.GOOS), "json"); policy.Exists {
			nodes = append(nodes, policy)
		}
	}
	nodes = append(nodes,
		fileSurface(KindSettings, "Settings", s.SettingsPath(), "json"),
		fileSurface(KindSandbox, "Sandbox", s.SandboxPath(), "json"),
		dirSurface(KindMemory, "Memory", filepath.Join(s.globalConfigPath, "memories")),
	)
	if s.GetMode() != ModeWorkspace {
		// Editors and programs connect per user, not per project: one entry in Global.
		nodes = append(nodes, &SurfaceNode{ID: KindACP, Name: "ACP", Kind: KindACP, Exists: true})
	}
	// Chats always live under the global Kiro home; in a Workspace the view shows that workspace's chats. Last: the most used.
	return append(nodes, dirSurface(KindSessions, "Chats & usage", filepath.Join(s.globalConfigPath, "sessions")))
}

// specsGroup lists each spec folder in .kiro/specs with its files under it
// (requirements.md or bugfix.md, design.md, tasks.md and anything else; Kiro's
// hidden .config.kiro is read by the spec page). Loose files directly in
// .kiro/specs are listed as they are.
func specsGroup(dir string) *SurfaceNode {
	group := groupNode(KindSpecs, "Specs", dir)
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".") {
			continue
		}
		if !e.IsDir() {
			if strings.HasSuffix(e.Name(), ".md") {
				group.Children = append(group.Children, fileNode(KindSpecs+":"+e.Name(), e.Name(), filepath.Join(dir, e.Name())))
			}
			continue
		}
		sdir := filepath.Join(dir, e.Name())
		n := &SurfaceNode{ID: KindSpec + ":" + e.Name(), Name: e.Name(), Kind: KindSpec, Path: sdir, Exists: true}
		for _, f := range folderFiles(sdir) {
			n.Children = append(n.Children, fileNode("specfile:"+e.Name()+"/"+f.Rel, f.Rel, f.Path))
		}
		group.Children = append(group.Children, n)
	}
	return group
}

// dirSurface is a single item backed by one of Kiro's own folders (not a group).
func dirSurface(kind, label, dir string) *SurfaceNode {
	info, err := os.Stat(dir)
	return &SurfaceNode{ID: kind, Name: label, Kind: kind, Path: dir, Exists: err == nil && info.IsDir()}
}

// mcpSurface is mcp.json with one child per server, so the navigator can
// show which servers an agent gets.
func mcpSurface(path string) *SurfaceNode {
	n := fileSurface(KindMCP, "MCP servers", path, "json")
	for _, srv := range readMCPServers(path) {
		n.Children = append(n.Children, &SurfaceNode{
			ID: KindMCPServer + ":" + srv.Name, Name: srv.Name, Kind: KindMCPServer,
			Path: path, Format: "json", Exists: true, Disabled: srv.Disabled,
		})
	}
	return n
}

// mcpServer is one entry of an mcpServers map.
type mcpServer struct {
	Name     string
	Disabled bool
}

// readMCPServers lists the servers in an mcp.json, sorted by name. A missing
// or unreadable file has none.
func readMCPServers(path string) []mcpServer {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var doc struct {
		Servers map[string]struct {
			Disabled bool `json:"disabled"`
		} `json:"mcpServers"`
	}
	if json.Unmarshal(data, &doc) != nil {
		return nil
	}
	out := make([]mcpServer, 0, len(doc.Servers))
	for name, srv := range doc.Servers {
		out = append(out, mcpServer{Name: name, Disabled: srv.Disabled})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// agentsGroup lists agent specs (.json/.md), one node per id; JSON wins when
// both formats exist, matching kiro-cli's resolution.
func agentsGroup(dir string) *SurfaceNode {
	group := groupNode(KindAgents, "Agents", dir)
	byID := map[string]string{}
	for _, name := range listFiles(dir, ".json", ".md") {
		id := strings.TrimSuffix(name, filepath.Ext(name))
		if prev, ok := byID[id]; !ok || strings.EqualFold(filepath.Ext(prev), ".md") {
			byID[id] = name
		}
	}
	ids := make([]string, 0, len(byID))
	for id := range byID {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	for _, id := range ids {
		group.Children = append(group.Children, &SurfaceNode{
			ID: "agent:" + id, Name: id, Kind: KindAgent,
			Path: filepath.Join(dir, byID[id]), Format: formatOf(byID[id]), Exists: true,
		})
	}
	return group
}

// filesGroup lists files with ext directly inside dir as leaves of leafKind.
func filesGroup(kind, leafKind, label, dir, ext string) *SurfaceNode {
	group := groupNode(kind, label, dir)
	for _, name := range listFiles(dir, ext) {
		leaf := fileNode(kind+":"+name, name, filepath.Join(dir, name))
		leaf.Kind = leafKind
		group.Children = append(group.Children, leaf)
	}
	return group
}

// deepGroup lists files with one of exts anywhere below dir (Kiro reads
// steering subfolders, e.g. AIM's steering/amazon-builder/*.md; specs live in
// one folder each). Names are paths relative to dir.
func deepGroup(kind, label, dir string, exts ...string) *SurfaceNode {
	group := groupNode(kind, label, dir)
	for _, rel := range listFilesDeep(dir, exts...) {
		group.Children = append(group.Children, fileNode(kind+":"+rel, rel, filepath.Join(dir, rel)))
	}
	return group
}

// listFilesDeep returns sorted slash-separated paths, relative to dir, of
// non-hidden files with one of exts anywhere below dir.
func listFilesDeep(dir string, exts ...string) []string {
	var out []string
	_ = filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if strings.HasPrefix(d.Name(), ".") && path != dir {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if !d.IsDir() && hasExt(d.Name(), exts) {
			rel, _ := filepath.Rel(dir, path)
			out = append(out, filepath.ToSlash(rel))
		}
		return nil
	})
	sort.Strings(out)
	return out
}

// skillsGroup lists skill packages: directories containing SKILL.md.
func skillsGroup(dir string) *SurfaceNode {
	group := groupNode(KindSkills, "Skills", dir)
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if !e.IsDir() || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		skillDir := filepath.Join(dir, e.Name())
		skillFile := filepath.Join(skillDir, "SKILL.md")
		if info, err := os.Stat(skillFile); err == nil && !info.IsDir() {
			skill := fileNode("skill:"+e.Name(), e.Name(), skillFile)
			// The folder's other files: scripts, references, assets. SKILL.md is the skill itself.
			for _, f := range SkillFiles(skillDir) {
				skill.Children = append(skill.Children, fileNode("skillfile:"+e.Name()+"/"+f.Rel, f.Rel, f.Path))
			}
			group.Children = append(group.Children, skill)
		}
	}
	return group
}

// SkillFile is one file inside a skill folder, other than SKILL.md.
type SkillFile struct {
	Rel  string `json:"rel"` // slash-separated, relative to the skill folder
	Path string `json:"path"`
	Size int64  `json:"size"`
}

// SkillFiles lists every regular file below a skill folder except SKILL.md,
// hidden files and folders skipped, sorted by relative path.
func SkillFiles(dir string) []SkillFile {
	out := []SkillFile{}
	for _, f := range folderFiles(dir) {
		if f.Rel != "SKILL.md" {
			out = append(out, f)
		}
	}
	return out
}

// folderFiles lists every regular file below dir, hidden files and folders
// skipped, sorted by relative path.
func folderFiles(dir string) []SkillFile {
	out := []SkillFile{}
	_ = filepath.WalkDir(dir, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if strings.HasPrefix(d.Name(), ".") && p != dir {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if d.IsDir() {
			return nil
		}
		rel, _ := filepath.Rel(dir, p)
		var size int64
		if info, ierr := d.Info(); ierr == nil {
			size = info.Size()
		}
		out = append(out, SkillFile{Rel: filepath.ToSlash(rel), Path: p, Size: size})
		return nil
	})
	sort.Slice(out, func(i, j int) bool { return out[i].Rel < out[j].Rel })
	return out
}

// groupNode builds an (initially empty) group for dir.
func groupNode(kind, label, dir string) *SurfaceNode {
	info, err := os.Stat(dir)
	return &SurfaceNode{ID: kind, Name: label, Kind: kind, Path: dir, Exists: err == nil && info.IsDir()}
}

// fileSurface builds a single-file surface node.
func fileSurface(kind, label, path, format string) *SurfaceNode {
	_, err := os.Stat(path)
	return &SurfaceNode{ID: kind, Name: label, Kind: kind, Path: path, Format: format, Exists: err == nil}
}

// fileNode builds a plain, existing file node.
func fileNode(id, name, path string) *SurfaceNode {
	return &SurfaceNode{ID: id, Name: name, Kind: KindFile, Path: path, Format: formatOf(path), Exists: true}
}

// listFiles returns sorted names of non-hidden regular files in dir with one of exts.
func listFiles(dir string, exts ...string) []string {
	entries, _ := os.ReadDir(dir)
	var out []string
	for _, e := range entries {
		if e.IsDir() || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		ext := strings.ToLower(filepath.Ext(e.Name()))
		for _, want := range exts {
			if ext == want {
				out = append(out, e.Name())
				break
			}
		}
	}
	sort.Strings(out)
	return out
}

func hasExt(name string, exts []string) bool {
	for _, e := range exts {
		if len(name) > len(e) && strings.EqualFold(name[len(name)-len(e):], e) {
			return true
		}
	}
	return false
}

// formatOf maps a file name to json, yaml, md, or text.
func formatOf(name string) string {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".json":
		return "json"
	case ".yaml", ".yml":
		return "yaml"
	case ".md":
		return "md"
	default:
		return "text"
	}
}
