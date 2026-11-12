package mcp

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"

	"kiromanager/internal/system"
)

// toolID is MCPToolID made unique the way Kiro does, with _1, _2, ….
func toolID(server, tool string, used map[string]bool) string {
	id := system.MCPToolID(server, tool)
	for n := 1; used[id]; n++ {
		suffix := fmt.Sprintf("_%d", n)
		base := id
		if len(base) > system.MaxMCPToolID-len(suffix) {
			base = base[:system.MaxMCPToolID-len(suffix)]
		}
		if !used[base+suffix] {
			id = base + suffix
			break
		}
	}
	used[id] = true
	return id
}

// compactJSON is JSON.stringify(v): no spaces, no HTML escaping.
func compactJSON(v any) string {
	if v == nil {
		return ""
	}
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	if enc.Encode(v) != nil {
		return ""
	}
	return strings.TrimSuffix(b.String(), "\n")
}

// toolsSize measures a server's tool definitions the way Kiro's context
// breakdown does: for each tool, its id, description and input schema.
func toolsSize(server string, tools []MCPTool) system.MCPSize {
	used := map[string]bool{}
	size := system.MCPSize{Tools: make(map[string]int, len(tools))}
	for _, t := range tools {
		desc := t.Description
		if desc == "" {
			desc = "Use the " + t.Name + " tool"
		}
		var schema any
		if t.InputSchema != nil {
			schema = t.InputSchema
		}
		size.Tools[t.Name] = system.KiroTokens(toolID(server, t.Name, used) + desc + compactJSON(schema))
	}
	return size
}

// launch is the part of a server config that decides its tools.
func (c *MCPServerConfig) launch() system.MCPLaunch {
	return system.MCPLaunch{Command: c.Command, Args: c.Args, URL: c.URL, Env: c.Env, Headers: c.Headers}
}
