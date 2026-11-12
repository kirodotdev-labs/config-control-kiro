package mcp

import "encoding/json"

// protocolVersion is the MCP protocol revision this client speaks.
const protocolVersion = "2025-06-18"

// MCPRequest is a JSON-RPC 2.0 request or notification.
type MCPRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      int    `json:"id,omitempty"`
	Method  string `json:"method"`
	Params  any    `json:"params,omitempty"`
}

// MCPResponse is a JSON-RPC 2.0 response.
type MCPResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int             `json:"id,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *MCPError       `json:"error,omitempty"`
}

// MCPError is a JSON-RPC 2.0 error object.
type MCPError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// MCPToolsResult is the result of tools/list.
type MCPToolsResult struct {
	Tools []MCPTool `json:"tools"`
}

// MCPTool describes one tool exposed by an MCP server.
type MCPTool struct {
	Name        string         `json:"name"`
	Description string         `json:"description,omitempty"`
	InputSchema map[string]any `json:"inputSchema,omitempty"`
}

// MCPServerConfig is one server entry in mcp.json or an agent's mcpServers.
type MCPServerConfig struct {
	Command       string            `json:"command,omitempty"`
	Args          []string          `json:"args,omitempty"`
	URL           string            `json:"url,omitempty"`
	Env           map[string]string `json:"env,omitempty"`
	Headers       map[string]string `json:"headers,omitempty"`
	Disabled      bool              `json:"disabled,omitempty"`
	AutoApprove   []string          `json:"autoApprove,omitempty"`
	DisabledTools []string          `json:"disabledTools,omitempty"`
}

// toolsListRequest builds a tools/list request with the given id.
func toolsListRequest(id int) MCPRequest {
	return MCPRequest{JSONRPC: "2.0", ID: id, Method: "tools/list"}
}

// initializeRequest builds the protocol handshake request.
func initializeRequest(id int) MCPRequest {
	return MCPRequest{
		JSONRPC: "2.0",
		ID:      id,
		Method:  "initialize",
		Params: map[string]any{
			"protocolVersion": protocolVersion,
			"capabilities":    map[string]any{"roots": map[string]bool{"listChanged": true}, "sampling": map[string]any{}},
			"clientInfo":      map[string]string{"name": "ConfigControlForKiro", "version": "1.0.0"},
		},
	}
}
