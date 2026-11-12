package agent

import (
	"os"
	"path/filepath"
	"sort"
	"strings"

	"kiromanager/internal/shared/ordered"
	"kiromanager/internal/system"
)

// Link connects the selected navigator item to another navigator item.
type Link struct {
	ID        string   `json:"id"`                  // navigator node id
	Via       string   `json:"via"`                 // how they are connected, for the tooltip
	Inherited bool     `json:"inherited,omitempty"` // implied by Kiro's default resources, not listed in the spec
	Unused    bool     `json:"unused,omitempty"`    // connected, but Kiro won't use it (a disabled or ungranted MCP server)
	Context   *Context `json:"context,omitempty"`   // what it adds to the agent's context with every message
}

// Outside is a connection to something that is not in the active scope's tree.
type Outside struct {
	Label   string   `json:"label"`
	Path    string   `json:"path,omitempty"`
	Via     string   `json:"via"`
	Note    string   `json:"note,omitempty"`
	Unused  bool     `json:"unused,omitempty"` // see Link.Unused
	Context *Context `json:"context,omitempty"`
	// Kind says what Path is, so the UI can open it: "skill" (a SKILL.md),
	// "steering" (a Markdown resource), "file" (anything else that exists),
	// "missing" (a path that doesn't exist), or "" (not a file: a server, a folder, a Global agent).
	Kind string `json:"kind,omitempty"`
}

// Relations is everything connected to one navigator item.
type Relations struct {
	Links []Link    `json:"links"`
	Other []Outside `json:"other"`
}

// Relations returns what the navigator item id is connected to: for an agent,
// the files it uses; for a file, the agents that use it. Nothing is computed
// until an item is selected, so this stays cheap however many agents exist.
func (s *AgentService) Relations(id string) Relations {
	scope := newScopeIndex(s.kiro)
	out := Relations{Links: []Link{}, Other: []Outside{}}
	if agentID, ok := strings.CutPrefix(id, "agent:"); ok {
		scope.agentRelations(filepath.Join(s.kiro.AgentsDir(), specFileFor(s.kiro.AgentsDir(), agentID)), &out)
	} else if strings.HasPrefix(id, system.KindMCPServer+":") {
		scope.serverRelations(id, &out)
	} else if id == system.KindMCP {
		scope.mcpFileRelations(&out)
	} else if id == system.KindPowers {
		scope.powersRelations(&out)
	} else if path, ok := scope.pathOf[id]; ok {
		scope.fileRelations(id, path, &out)
	}
	sort.SliceStable(out.Links, func(i, j int) bool { return out.Links[i].ID < out.Links[j].ID })
	return out
}

// specFileFor returns the spec file name for id in dir (JSON wins over .md).
func specFileFor(dir, id string) string {
	for _, f := range specFiles(dir) {
		if stem(f) == id {
			return f
		}
	}
	return id + ".json"
}

// agentRelations fills out with the files the agent at specPath uses.
func (x *scopeIndex) agentRelations(specPath string, out *Relations) {
	doc, err := readDocument(specPath)
	if err != nil {
		return
	}
	spec, _ := doc.view()
	seen := map[string]bool{}
	for _, r := range x.refsOf(specPath, spec) {
		ids := x.match(r.target)
		for _, id := range ids {
			if !seen[id] {
				seen[id] = true
				out.Links = append(out.Links, Link{ID: id, Via: r.via, Context: r.context(x.pathOf[id])})
			}
		}
		if len(ids) == 0 {
			for _, o := range r.outside() {
				if o.Kind != "" && o.Kind != "missing" {
					o.Context = r.context(o.Path)
				}
				out.Other = append(out.Other, o)
			}
		}
	}
	x.addServers(spec, out)
	x.addPowers(spec, out)
	for id, via := range x.applies {
		if !seen[id] {
			out.Links = append(out.Links, Link{ID: id, Via: via, Inherited: true})
		}
	}
	if !x.inherits {
		return
	}
	for id, via := range x.inheritable {
		if !seen[id] {
			var ctx *Context
			if x.always[id] {
				ctx = fileContext(x.pathOf[id])
			}
			out.Links = append(out.Links, Link{ID: id, Via: via, Inherited: true, Context: ctx})
		}
	}
	if x.globalInherited != "" {
		out.Other = append(out.Other, Outside{Label: "Global steering and skills", Path: x.globalHome, Via: "inherited", Note: x.globalInherited,
			Context: globalContext(x.globalHome)})
	}
}

// fileRelations fills out with the agents that use the file behind node id.
func (x *scopeIndex) fileRelations(id, path string, out *Relations) {
	for _, a := range x.agents {
		if via, ok := x.uses(a, path); ok {
			if a.inTree {
				out.Links = append(out.Links, Link{ID: "agent:" + a.id, Via: via})
			} else {
				out.Other = append(out.Other, Outside{Label: "Global agent " + a.id, Path: a.path, Via: via})
			}
		}
	}
	if via, ok := x.inheritable[id]; ok && x.inherits {
		out.Links = append(out.Links, Link{ID: system.KindAgents, Via: via + ", every agent", Inherited: true})
	}
	if via, ok := x.applies[id]; ok {
		out.Links = append(out.Links, Link{ID: system.KindAgents, Via: via, Inherited: true})
	}
}

// uses reports whether agent a references path, and how.
func (x *scopeIndex) uses(a agentFile, path string) (string, bool) {
	doc, err := readDocument(a.path)
	if err != nil {
		return "", false
	}
	spec, _ := doc.view()
	for _, r := range x.refsOf(a.path, spec) {
		if r.target.resolved && (pathKey(r.target.path) == pathKey(path) || (r.target.glob && globMatch(pathKey(r.target.path), pathKey(path)))) {
			return r.via, true
		}
	}
	return "", false
}

// ref is one thing an agent spec points at.
type ref struct {
	via    string
	raw    string
	target target
	full   bool // loaded in full with every message (file:// resources, the prompt file)
}

// context is what the reference adds when it points at path.
func (r ref) context(path string) *Context {
	if !r.full {
		return nil
	}
	return fileContext(path)
}

// outside describes what a reference points at beyond this scope: one row
// per file (a glob expands to the files it matches, up to a limit), or one
// row for a path that isn't a file.
func (r ref) outside() []Outside {
	o := Outside{Label: r.raw, Via: r.via, Note: r.target.note}
	if !r.target.resolved {
		return []Outside{o}
	}
	if !r.target.glob {
		o.Path, o.Kind = r.target.path, outsideKind(r.target.path)
		if o.Kind != "" && o.Kind != "missing" { // an existing file: show its name, keep the URI in the tooltip
			o.Label, o.Via = outsideLabel(r.target.path, o.Kind), r.via+" ("+r.raw+")"
		}
		return []Outside{o}
	}
	matches := expandGlob(r.target.path)
	if len(matches) == 0 {
		return []Outside{o}
	}
	out := make([]Outside, 0, len(matches))
	for _, p := range matches {
		kind := outsideKind(p)
		out = append(out, Outside{Label: outsideLabel(p, kind), Path: p, Via: r.via + " (" + r.raw + ")", Kind: kind})
	}
	return out
}

// outsideLabel names a file row: the file name, or folder/SKILL.md for a skill
// (the folder is the skill's name).
func outsideLabel(path, kind string) string {
	if kind == "skill" {
		return filepath.Base(filepath.Dir(path)) + "/SKILL.md"
	}
	return filepath.Base(path)
}

// outsideKind classifies a referenced path for the UI.
func outsideKind(path string) string {
	info, err := os.Stat(path)
	switch {
	case err != nil:
		return "missing"
	case info.IsDir():
		return ""
	case filepath.Base(path) == "SKILL.md":
		return "skill"
	case strings.EqualFold(filepath.Ext(path), ".md"):
		return "steering"
	default:
		return "file"
	}
}

// expandGlob lists the existing files a resource glob matches (at most 50),
// walking from the pattern's fixed leading folder.
func expandGlob(pattern string) []string {
	root := pattern
	for strings.ContainsAny(root, "*?[") {
		root = filepath.Dir(root)
	}
	if info, err := os.Stat(root); err != nil || !info.IsDir() {
		return nil
	}
	var out []string
	_ = filepath.WalkDir(root, func(p string, d os.DirEntry, err error) error {
		if err != nil || len(out) >= 50 {
			return nil
		}
		if d.IsDir() {
			if strings.HasPrefix(d.Name(), ".") && p != root {
				return filepath.SkipDir
			}
			return nil
		}
		if globMatch(pathKey(pattern), pathKey(p)) {
			out = append(out, p)
		}
		return nil
	})
	sort.Strings(out)
	return out
}

// refsOf lists the file references in spec: resources, a file:// prompt and
// knowledge-base sources (MCP servers are handled by addServers).
func (x *scopeIndex) refsOf(specPath string, spec *ordered.Object) []ref {
	var refs []ref
	var resources []any
	_, _ = spec.Get("resources", &resources)
	for _, res := range resources {
		switch v := res.(type) {
		case string:
			via, full := "resources", true
			if strings.HasPrefix(v, "skill://") {
				via, full = "resources (skill)", false // only its name and description, until used
			}
			refs = append(refs, ref{via: via, raw: v, target: x.resolve(v, x.root), full: full})
		case map[string]any:
			if src, ok := v["source"].(string); ok {
				name, _ := v["name"].(string)
				refs = append(refs, ref{via: "knowledge base " + name, raw: src, target: x.resolve(src, x.root)})
			}
		}
	}
	if p := spec.String("prompt"); strings.HasPrefix(strings.TrimSpace(p), "file://") {
		// Prompt files resolve relative to the agent config's own folder.
		refs = append(refs, ref{via: "prompt", raw: strings.TrimSpace(p), target: x.resolve(strings.TrimSpace(p), filepath.Dir(specPath)), full: true})
	}
	return refs
}
