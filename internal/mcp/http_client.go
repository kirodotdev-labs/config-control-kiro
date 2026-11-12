package mcp

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// maxHTTPResponse caps how much of a remote server's reply is read.
const maxHTTPResponse = 10 << 20 // 10 MiB

// MCPHttpClient talks to a remote MCP server over HTTP (JSON or SSE replies).
type MCPHttpClient struct {
	url     string
	headers map[string]string
	client  *http.Client
}

// NewMCPHttpClient creates a client for url with optional request headers.
func NewMCPHttpClient(url string, headers map[string]string) *MCPHttpClient {
	return &MCPHttpClient{url: url, headers: headers, client: &http.Client{Timeout: 30 * time.Second}}
}

// ListTools returns the tools the remote server exposes.
func (c *MCPHttpClient) ListTools() ([]MCPTool, error) {
	var result MCPToolsResult
	if err := c.call(toolsListRequest(1), &result); err != nil {
		return nil, err
	}
	return result.Tools, nil
}

// call POSTs req and decodes the JSON-RPC result into out.
func (c *MCPHttpClient) call(req MCPRequest, out any) error {
	data, err := json.Marshal(req)
	if err != nil {
		return err
	}
	httpReq, err := http.NewRequest(http.MethodPost, c.url, bytes.NewReader(data))
	if err != nil {
		return err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "application/json, text/event-stream")
	for k, v := range c.headers {
		httpReq.Header.Set(k, v)
	}
	resp, err := c.client.Do(httpReq)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxHTTPResponse))
	if err != nil {
		return err
	}
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, truncate(string(body), 200))
	}
	return decodeRPCResult(extractRPCPayload(body), out)
}

// extractRPCPayload returns the JSON-RPC message from a plain JSON body or
// from the first "data:" line of a Server-Sent Events body.
func extractRPCPayload(body []byte) []byte {
	if !bytes.HasPrefix(body, []byte("event:")) {
		return body
	}
	for _, line := range bytes.Split(body, []byte("\n")) {
		if after, ok := bytes.CutPrefix(line, []byte("data: ")); ok {
			return after
		}
	}
	return nil
}

// decodeRPCResult unmarshals a JSON-RPC message and its result into out.
func decodeRPCResult(payload []byte, out any) error {
	if payload == nil {
		return fmt.Errorf("no data found in SSE response")
	}
	var msg struct {
		Result json.RawMessage `json:"result"`
		Error  *MCPError       `json:"error"`
	}
	if err := json.Unmarshal(payload, &msg); err != nil {
		return err
	}
	if msg.Error != nil {
		return fmt.Errorf("MCP error: %s", msg.Error.Message)
	}
	return json.Unmarshal(msg.Result, out)
}

// truncate shortens s to at most n bytes for error messages.
func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
