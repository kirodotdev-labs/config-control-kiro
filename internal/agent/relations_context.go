package agent

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"kiromanager/internal/shared/ordered"
	"kiromanager/internal/system"
)

// Context is what a connected item adds to the agent's context window with
// every message, counted the way Kiro's context breakdown counts it (see
// system.KiroTokens). Files count in full: file:// resources, the prompt file,
// always-on steering and AGENTS.md. An MCP server counts the definitions of
// the tools the agent gets. Skills, auto, manual and fileMatch steering,
// knowledge bases, hooks and rules are loaded on demand or not sent, so they
// have none.
type Context struct {
	Tokens int `json:"tokens"`
	// For an MCP server: Tools is the number of tools sent, of ToolsTotal it
	// offers (less its disabledTools); From is where Kiro takes its
	// definition from (mcp.json, global or agent). Unmeasured is set while
	// its tools haven't been listed, with Problem saying why when known.
	Tools      int    `json:"tools,omitempty"`
	ToolsTotal int    `json:"toolsTotal,omitempty"`
	From       string `json:"from,omitempty"`
	Unmeasured bool   `json:"unmeasured,omitempty"`
	Problem    string `json:"problem,omitempty"`
}

// Where Kiro takes an MCP server's definition from.
const (
	fromGlobal    = "global"   // Global mcp.json, given to a Workspace agent
	fromScopeJSON = "mcp.json" // this scope's mcp.json
	fromAgent     = "agent"    // the agent's own mcpServers
)

// untrustedNote is why a Workspace server isn't measured automatically.
const untrustedNote = "Not measured: Kiro hasn't been told to trust this Workspace, so its servers aren't started automatically. " +
	"Trust the Workspace in Kiro, or list the server's tools in MCP servers."

// fileContext is the context a file adds when it is loaded in full.
func fileContext(path string) *Context {
	if info, err := os.Stat(path); err != nil || info.IsDir() {
		return nil
	}
	return &Context{Tokens: system.FileTokens(path)}
}

// alwaysLoaded reports whether Kiro sends a steering file with every message:
// inclusion always, or no inclusion set.
func alwaysLoaded(path string) bool { return steeringInclusion(path) == "always" }

// mcpUse is one MCP server an agent gets.
type mcpUse struct {
	name    string
	id      string // navigator row for this name, "" when there is none in this scope
	from    string // where Kiro takes its definition from (fromGlobal, …)
	def     serverDef
	picker  toolPicker
	granted bool // some of its tools can reach the agent
}

// serverDef is the part of a server entry that decides what Kiro sends.
type serverDef struct {
	system.MCPLaunch
	Disabled      bool     `json:"disabled"`
	DisabledTools []string `json:"disabledTools"`
}

// readServerDefs reads the mcpServers map of an mcp.json.
func readServerDefs(path string) map[string]serverDef {
	var doc struct {
		Servers map[string]serverDef `json:"mcpServers"`
	}
	if data, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(data, &doc)
	}
	return doc.Servers
}

// toolPicker decides which MCP tools Kiro gives an agent, as Kiro's tool
// filter does: includeMcpJson gives every MCP tool; otherwise a tool is given
// when an entry of tools matches it ("*", or its id or one of its tags
// @server/tool, @server, @mcp, with * and ? wildcards); excludedTools then
// takes tools away.
type toolPicker struct {
	all      bool
	tools    []string
	excluded []string
}

func newToolPicker(spec *ordered.Object) toolPicker {
	var p toolPicker
	var star string
	if ok, _ := spec.Get("tools", &star); ok && star == "*" {
		p.all = true
	}
	_, _ = spec.Get("tools", &p.tools)
	_, _ = spec.Get("excludedTools", &p.excluded)
	var include bool
	if ok, _ := spec.Get("includeMcpJson", &include); ok && include {
		p.all = true
	}
	return p
}

// names are what an entry of tools can match for one tool.
func toolNames(server, tool string) []string {
	return []string{system.MCPToolID(server, tool), "@" + server + "/" + tool, "@" + server, "@mcp"}
}

// matchesAny reports whether a pattern list matches one of names.
func matchesAny(patterns, names []string) bool {
	for _, p := range patterns {
		if p == "*" {
			return true
		}
		for _, n := range names {
			if wildcardMatch(p, n) {
				return true
			}
		}
	}
	return false
}

// picks reports whether the agent gets the server's tool.
func (p toolPicker) picks(server, tool string) bool {
	names := toolNames(server, tool)
	return (p.all || matchesAny(p.tools, names)) && !matchesAny(p.excluded, names)
}

// mayPick reports whether some tool of the server can reach the agent, when
// its tool names aren't known yet.
func (p toolPicker) mayPick(server string) bool {
	if matchesAny(p.excluded, []string{"@" + server, "@mcp"}) {
		return false
	}
	if p.all {
		return true
	}
	scoped := "@" + server + "/"
	for _, t := range p.tools {
		if t == "*" || matchesAny([]string{t}, []string{"@" + server, "@mcp"}) || strings.HasPrefix(t, scoped) {
			return true
		}
		// A wildcard before the tool name, like @serv*/read or @*/search.
		if pre := wildcardPrefix(t); pre != t && strings.HasPrefix(scoped, pre) {
			return true
		}
	}
	return false
}

// wildcardMatch matches name against a pattern the way Kiro does: * is any
// run of characters, ? one character; without wildcards it must be equal.
func wildcardMatch(pattern, name string) bool {
	if !strings.ContainsAny(pattern, "*?") {
		return pattern == name
	}
	expr := strings.NewReplacer(`\*`, ".*", `\?`, ".").Replace(regexp.QuoteMeta(pattern))
	ok, _ := regexp.MatchString("^"+expr+"$", name)
	return ok
}

// wildcardPrefix is the part of a pattern before its first wildcard.
func wildcardPrefix(pattern string) string {
	if i := strings.IndexAny(pattern, "*?"); i >= 0 {
		return pattern[:i]
	}
	return pattern
}

// mcpServersOf lists the servers an agent gets, Kiro's way: with
// includeMcpJson, Global then Workspace mcp.json; then the agent's own
// mcpServers, each replacing a server of the same name. A server joins the
// navigator row of the same name, wherever Kiro takes its definition from.
func (x *scopeIndex) mcpServersOf(spec *ordered.Object) []mcpUse {
	picker := newToolPicker(spec)
	byName := map[string]mcpUse{}
	var include bool
	if ok, _ := spec.Get("includeMcpJson", &include); ok && include {
		for name, def := range x.globalServers {
			byName[name] = mcpUse{name: name, from: fromGlobal, def: def}
		}
		for name, def := range x.serverDefs {
			byName[name] = mcpUse{name: name, from: fromScopeJSON, def: def}
		}
	}
	var own map[string]serverDef
	_, _ = spec.Get("mcpServers", &own)
	for name, def := range own {
		byName[name] = mcpUse{name: name, from: fromAgent, def: def}
	}
	out := make([]mcpUse, 0, len(byName))
	for _, u := range byName {
		u.id, u.picker = x.servers[u.name], picker
		u.granted = picker.mayPick(u.name)
		out = append(out, u)
	}
	return out
}

// via describes a server connection for the navigator tooltip.
func (u mcpUse) via() string {
	from := "MCP server, defined in " + map[string]string{
		fromGlobal: "Global mcp.json", fromScopeJSON: "mcp.json", fromAgent: "this agent's own mcpServers",
	}[u.from]
	switch {
	case u.def.Disabled:
		return from + ". Turned off: Kiro doesn't start it"
	case !u.granted:
		return from + ". None of its tools reach the agent (tools, excludedTools)"
	}
	return from
}

// used reports whether Kiro starts the server and gives the agent its tools.
func (u mcpUse) used() bool { return !u.def.Disabled && u.granted }

// context is what the server's tool definitions add, from its measured size.
func (x *scopeIndex) context(u mcpUse) *Context {
	if !u.used() {
		return nil
	}
	size, ok := x.sizes.Lookup(u.name, u.def.MCPLaunch)
	if !ok {
		problem := x.sizes.Failure(u.name, u.def.MCPLaunch)
		if problem == "" && x.gated(u) {
			problem = untrustedNote
		}
		return &Context{Unmeasured: true, From: u.from, Problem: problem}
	}
	off := map[string]bool{}
	for _, t := range u.def.DisabledTools {
		off[t] = true
	}
	tokens, count := size.Sent(func(tool string) bool { return !off[tool] && u.picker.picks(u.name, tool) })
	_, offered := size.Sent(func(tool string) bool { return !off[tool] })
	return &Context{Tokens: tokens, Tools: count, ToolsTotal: offered, From: u.from}
}

// gated reports whether the server comes from an untrusted Workspace, so it
// mustn't be started automatically: Workspace files can come from a cloned
// repository. Global mcp.json servers are the user's own.
func (x *scopeIndex) gated(u mcpUse) bool {
	return x.untrusted && u.from != fromGlobal
}

// addServers links an agent to its MCP servers: the navigator row of the same
// name where there is one, an Other row otherwise.
func (x *scopeIndex) addServers(spec *ordered.Object, out *Relations) {
	var include bool
	if ok, _ := spec.Get("includeMcpJson", &include); ok && include {
		out.Links = append(out.Links, Link{ID: system.KindMCP, Via: "includeMcpJson"})
	}
	for _, u := range x.mcpServersOf(spec) {
		if u.id != "" {
			out.Links = append(out.Links, Link{ID: u.id, Via: u.via(), Unused: !u.used(), Context: x.context(u)})
			continue
		}
		out.Other = append(out.Other, Outside{Label: "MCP server " + u.name, Via: u.via(), Unused: !u.used(), Context: x.context(u)})
	}
}

// serverRelations links an MCP server row to the agents that get it.
func (x *scopeIndex) serverRelations(id string, out *Relations) {
	for _, a := range x.agents {
		doc, err := readDocument(a.path)
		if err != nil {
			continue
		}
		spec, _ := doc.view()
		for _, u := range x.mcpServersOf(spec) {
			if u.id != id {
				continue
			}
			if a.inTree {
				out.Links = append(out.Links, Link{ID: "agent:" + a.id, Via: u.via(), Unused: !u.used()})
			} else {
				out.Other = append(out.Other, Outside{Label: "Global agent " + a.id, Path: a.path, Via: u.via()})
			}
		}
	}
}

// mcpFileRelations links mcp.json to the agents that include it.
func (x *scopeIndex) mcpFileRelations(out *Relations) {
	for _, a := range x.agents {
		doc, err := readDocument(a.path)
		if err != nil {
			continue
		}
		spec, _ := doc.view()
		var include bool
		if ok, _ := spec.Get("includeMcpJson", &include); !ok || !include {
			continue
		}
		if a.inTree {
			out.Links = append(out.Links, Link{ID: "agent:" + a.id, Via: "includeMcpJson"})
		} else {
			out.Other = append(out.Other, Outside{Label: "Global agent " + a.id, Path: a.path, Via: "includeMcpJson"})
		}
	}
}

// globalContext is what the always-on Global steering adds to a Workspace
// agent; it isn't a row in the Workspace tree. Nil when there is none.
func globalContext(globalHome string) *Context {
	tokens := 0
	_ = filepath.WalkDir(filepath.Join(globalHome, "steering"), func(p string, d os.DirEntry, err error) error {
		if err == nil && !d.IsDir() && strings.EqualFold(filepath.Ext(p), ".md") && alwaysLoaded(p) {
			tokens += system.FileTokens(p)
		}
		return nil
	})
	if tokens == 0 {
		return nil
	}
	return &Context{Tokens: tokens}
}

// usesPowers reports whether an agent gets the user's installed powers
// (includePowers: true). Powers are installed for the user, in Global only.
func usesPowers(spec *ordered.Object) bool {
	var on bool
	ok, _ := spec.Get("includePowers", &on)
	return ok && on
}

// addPowers links an agent with includePowers to the Powers row, or to an
// Other row in a Workspace, where Powers isn't in the tree.
func (x *scopeIndex) addPowers(spec *ordered.Object, out *Relations) {
	if !usesPowers(spec) {
		return
	}
	const via = "includePowers: the user's installed powers, switched on when a task matches them"
	if x.root == "" {
		out.Links = append(out.Links, Link{ID: system.KindPowers, Via: via})
		return
	}
	out.Other = append(out.Other, Outside{Label: "Global powers", Path: filepath.Join(x.globalHome, "powers"), Via: via})
}

// powersRelations links the Powers row to the agents that include powers.
func (x *scopeIndex) powersRelations(out *Relations) {
	for _, a := range x.agents {
		doc, err := readDocument(a.path)
		if err != nil {
			continue
		}
		if spec, _ := doc.view(); spec != nil && usesPowers(spec) {
			out.Links = append(out.Links, Link{ID: "agent:" + a.id, Via: "includePowers"})
		}
	}
}
