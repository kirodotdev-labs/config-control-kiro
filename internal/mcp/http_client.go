package mcp

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// MCPHttpClient communicates with a remote MCP server over HTTP.
// It supports both plain JSON and Server-Sent Events (SSE) response formats.
type MCPHttpClient struct {
	url     string
	headers map[string]string
	client  *http.Client
}

// NewMCPHttpClient creates a new HTTP-based MCP client for the given URL
// with optional custom headers.
func NewMCPHttpClient(url string, headers map[string]string) *MCPHttpClient {
	return &MCPHttpClient{
		url:     url,
		headers: headers,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// ListTools sends a tools/list request and returns the available tools.
func (c *MCPHttpClient) ListTools() ([]MCPTool, error) {
	req := MCPRequest{
		JSONRPC: "2.0",
		ID:      1,
		Method:  "tools/list",
	}

	var result MCPToolsResult
	if err := c.sendRequest(req, &result); err != nil {
		return nil, err
	}

	return result.Tools, nil
}

// sendRequest sends a JSON-RPC request over HTTP and decodes the result.
// It handles both plain JSON and SSE response formats.
func (c *MCPHttpClient) sendRequest(req MCPRequest, result interface{}) error {
	data, err := json.Marshal(req)
	if err != nil {
		return err
	}

	httpReq, err := http.NewRequest("POST", c.url, bytes.NewBuffer(data))
	if err != nil {
		return err
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "application/json, text/event-stream")
	for key, value := range c.headers {
		httpReq.Header.Set(key, value)
	}

	resp, err := c.client.Do(httpReq)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, string(body))
	}

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	// Check if SSE format (starts with "event:")
	bodyStr := string(body)
	if len(bodyStr) > 6 && bodyStr[:6] == "event:" {
		// Parse SSE - extract data after "data: "
		lines := bytes.Split(body, []byte("\n"))
		for _, line := range lines {
			if bytes.HasPrefix(line, []byte("data: ")) {
				jsonData := bytes.TrimPrefix(line, []byte("data: "))
				var mcpResp struct {
					Result json.RawMessage `json:"result"`
					Error  *MCPError       `json:"error"`
				}
				if err := json.Unmarshal(jsonData, &mcpResp); err != nil {
					return err
				}
				if mcpResp.Error != nil {
					return fmt.Errorf("MCP error: %s", mcpResp.Error.Message)
				}
				return json.Unmarshal(mcpResp.Result, result)
			}
		}
		return fmt.Errorf("no data found in SSE response")
	}

	// Plain JSON response
	var mcpResp struct {
		Result json.RawMessage `json:"result"`
		Error  *MCPError       `json:"error"`
	}
	if err := json.Unmarshal(body, &mcpResp); err != nil {
		return err
	}
	if mcpResp.Error != nil {
		return fmt.Errorf("MCP error: %s", mcpResp.Error.Message)
	}
	return json.Unmarshal(mcpResp.Result, result)
}
