package mcp

import (
	"strings"
	"testing"

	"kiromanager/internal/system"
)

func TestToolID(t *testing.T) {
	used := map[string]bool{}
	for _, tc := range []struct{ server, tool, want string }{
		{"Git-Hub", "list repos", "mcp_git_hub_list_repos"},
		{"aws.docs", "search", "mcp_awsdocs_search"},
		{"git", "hub_x", "mcp_git_hub_x"},
		{"git_hub", "x", "mcp_git_hub_x_1"}, // same id: made unique like Kiro
	} {
		if got := toolID(tc.server, tc.tool, used); got != tc.want {
			t.Errorf("toolID(%q, %q) = %q, want %q", tc.server, tc.tool, got, tc.want)
		}
	}
	if long := toolID("s", strings.Repeat("x", 100), map[string]bool{}); len(long) != system.MaxMCPToolID {
		t.Errorf("ids stop at %d characters: %d", system.MaxMCPToolID, len(long))
	}
}

func TestToolsSize(t *testing.T) {
	size := toolsSize("git", []MCPTool{
		{Name: "status", Description: "Show <status>", InputSchema: map[string]any{"type": "object"}},
		{Name: "log"},
	})
	// mcp_git_status + Show <status> + {"type":"object"} = 14+13+17 = 44 → 11
	// mcp_git_log + Use the log tool = 11+16 = 27 → 7
	if size.Tools["status"] != 11 || size.Tools["log"] != 7 {
		t.Errorf("sizes: %+v", size.Tools)
	}
}
