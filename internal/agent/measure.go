package agent

import (
	"path/filepath"
	"sort"

	"kiromanager/internal/system"
)

// Measurer lists MCP servers' tools so their sizes are remembered, and
// returns why each failed one couldn't be (mcp.MCPService does this).
type Measurer interface {
	MeasureTools(servers map[string]system.MCPLaunch) map[string]string
}

// Measured is the outcome of MeasureServers, by server name.
type Measured struct {
	Measured []string          `json:"measured"`
	Failed   map[string]string `json:"failed"`  // tried now and failed, or failed in the last few minutes
	Skipped  map[string]string `json:"skipped"` // not started, and why
}

// MeasureServers measures the MCP servers agent id uses whose size isn't
// known yet, so its context can be shown. Servers already measured, turned
// off, or not reaching the agent are left alone; one that failed recently
// isn't retried until system.RetryAfter has passed; servers of an untrusted
// Workspace aren't started.
func (s *AgentService) MeasureServers(id string) (Measured, error) {
	out := Measured{Measured: []string{}, Failed: map[string]string{}, Skipped: map[string]string{}}
	path, err := s.existingPath(id)
	if err != nil {
		return out, err
	}
	doc, err := readDocument(path)
	if err != nil {
		return out, err
	}
	spec, err := doc.view()
	if err != nil {
		return out, err
	}
	x := newScopeIndex(s.kiro)
	todo := map[string]system.MCPLaunch{}
	for _, u := range x.mcpServersOf(spec) {
		if !u.used() {
			continue
		}
		if _, ok := x.sizes.Lookup(u.name, u.def.MCPLaunch); ok {
			continue
		}
		switch reason := x.sizes.Failure(u.name, u.def.MCPLaunch); {
		case reason != "":
			out.Failed[u.name] = reason
		case x.gated(u):
			out.Skipped[u.name] = untrustedNote
		default:
			todo[u.name] = u.def.MCPLaunch
		}
	}
	if len(todo) == 0 {
		return out, nil
	}
	failed := s.measurer.MeasureTools(todo)
	for name := range todo {
		if reason, ok := failed[name]; ok {
			out.Failed[name] = reason
		} else {
			out.Measured = append(out.Measured, name)
		}
	}
	s.logger.Info("Measured MCP servers of %s: %d measured, %d failed", filepath.Base(path), len(out.Measured), len(failed))
	return out, nil
}

// ServerTools returns, by server name, the tools of each MCP server agent id
// gets, as last measured (less the server's disabledTools), for the tools
// pickers. It never starts a server: one not measured yet is left out.
func (s *AgentService) ServerTools(id string) (map[string][]string, error) {
	out := map[string][]string{}
	path, err := s.existingPath(id)
	if err != nil {
		return out, err
	}
	doc, err := readDocument(path)
	if err != nil {
		return out, err
	}
	spec, err := doc.view()
	if err != nil {
		return out, err
	}
	x := newScopeIndex(s.kiro)
	for _, u := range x.mcpServersOf(spec) {
		if u.def.Disabled {
			continue
		}
		size, ok := x.sizes.Lookup(u.name, u.def.MCPLaunch)
		if !ok {
			continue
		}
		off := map[string]bool{}
		for _, t := range u.def.DisabledTools {
			off[t] = true
		}
		names := []string{}
		for t := range size.Tools {
			if !off[t] {
				names = append(names, t)
			}
		}
		sort.Strings(names)
		out[u.name] = names
	}
	return out, nil
}
