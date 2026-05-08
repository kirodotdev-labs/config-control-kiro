package mcp

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"sync"
	"time"
)

// MCPStdioClient communicates with an MCP server over stdin/stdout using
// JSON-RPC 2.0. It manages the subprocess lifecycle, request/response
// correlation, and protocol initialization.
type MCPStdioClient struct {
	cmd             *exec.Cmd
	stdin           io.WriteCloser
	stdout          io.ReadCloser
	messageID       int
	pendingRequests map[int]chan *MCPResponse
	mu              sync.Mutex
	initialized     bool
}

// MCPRequest represents a JSON-RPC 2.0 request sent to an MCP server.
type MCPRequest struct {
	JSONRPC string      `json:"jsonrpc"`
	ID      int         `json:"id,omitempty"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params,omitempty"`
}

// MCPResponse represents a JSON-RPC 2.0 response received from an MCP server.
type MCPResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int             `json:"id,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *MCPError       `json:"error,omitempty"`
}

// MCPError represents a JSON-RPC 2.0 error object.
type MCPError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// MCPToolsResult holds the list of tools returned by a tools/list request.
type MCPToolsResult struct {
	Tools []MCPTool `json:"tools"`
}

// MCPTool describes a single tool exposed by an MCP server.
type MCPTool struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description,omitempty"`
	InputSchema map[string]interface{} `json:"inputSchema,omitempty"`
}

// NewMCPStdioClient creates a new stdio-based MCP client that will spawn
// the given command with the provided arguments.
func NewMCPStdioClient(command string, args []string) *MCPStdioClient {
	// #nosec G204 - command and args are from admin-controlled MCP server config
	return &MCPStdioClient{
		cmd:             exec.Command(command, args...), // nosemgrep: dangerous-exec-command
		messageID:       1,
		pendingRequests: make(map[int]chan *MCPResponse),
	}
}

// Connect starts the MCP server subprocess, wires up stdin/stdout,
// and performs the protocol initialization handshake.
func (c *MCPStdioClient) Connect() error {
	var err error

	c.stdin, err = c.cmd.StdinPipe()
	if err != nil {
		return err
	}

	c.stdout, err = c.cmd.StdoutPipe()
	if err != nil {
		return err
	}

	// Capture stderr to prevent blocking
	stderr, err := c.cmd.StderrPipe()
	if err != nil {
		return err
	}

	if err := c.cmd.Start(); err != nil {
		return err
	}

	// Discard stderr to prevent buffer blocking
	go io.Copy(io.Discard, stderr)

	// Start reading responses
	go c.readResponses()

	// Initialize
	return c.initialize()
}

// initialize performs the MCP protocol initialization handshake.
func (c *MCPStdioClient) initialize() error {
	req := MCPRequest{
		JSONRPC: "2.0",
		ID:      c.getNextID(),
		Method:  "initialize",
		Params: map[string]interface{}{
			"protocolVersion": "2025-06-18",
			"capabilities": map[string]interface{}{
				"roots":    map[string]bool{"listChanged": true},
				"sampling": map[string]interface{}{},
			},
			"clientInfo": map[string]string{
				"name":    "KiroManager",
				"version": "1.0.0",
			},
		},
	}

	_, err := c.sendRequest(req)
	if err != nil {
		return err
	}

	c.initialized = true

	// Send initialized notification
	c.sendNotification(MCPRequest{
		JSONRPC: "2.0",
		Method:  "notifications/initialized",
	})

	return nil
}

// ListTools sends a tools/list request and returns the available tools.
func (c *MCPStdioClient) ListTools() ([]MCPTool, error) {
	if !c.initialized {
		return nil, fmt.Errorf("client not initialized")
	}

	req := MCPRequest{
		JSONRPC: "2.0",
		ID:      c.getNextID(),
		Method:  "tools/list",
	}

	resp, err := c.sendRequest(req)
	if err != nil {
		return nil, err
	}

	var result MCPToolsResult
	if err := json.Unmarshal(resp.Result, &result); err != nil {
		return nil, err
	}

	return result.Tools, nil
}

// sendRequest writes a JSON-RPC request to stdin and waits for the
// correlated response with a 30-second timeout.
func (c *MCPStdioClient) sendRequest(req MCPRequest) (*MCPResponse, error) {
	c.mu.Lock()
	respChan := make(chan *MCPResponse, 1)
	c.pendingRequests[req.ID] = respChan
	c.mu.Unlock()

	data, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	if _, err := c.stdin.Write(append(data, '\n')); err != nil {
		return nil, err
	}

	select {
	case resp := <-respChan:
		if resp.Error != nil {
			return nil, fmt.Errorf("MCP error: %s", resp.Error.Message)
		}
		return resp, nil
	case <-time.After(30 * time.Second):
		return nil, fmt.Errorf("request timeout")
	}
}

// sendNotification writes a JSON-RPC notification (no response expected) to stdin.
func (c *MCPStdioClient) sendNotification(req MCPRequest) {
	data, _ := json.Marshal(req)
	c.stdin.Write(append(data, '\n'))
}

// readResponses continuously reads JSON-RPC responses from stdout and
// dispatches them to the appropriate pending request channel.
func (c *MCPStdioClient) readResponses() {
	scanner := bufio.NewScanner(c.stdout)
	// Increase buffer size for large responses (MCP servers can return many tools)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024) // 1MB max

	for scanner.Scan() {
		line := scanner.Text()

		var resp MCPResponse
		if err := json.Unmarshal([]byte(line), &resp); err != nil {
			continue
		}

		if resp.ID > 0 {
			c.mu.Lock()
			if ch, ok := c.pendingRequests[resp.ID]; ok {
				ch <- &resp
				delete(c.pendingRequests, resp.ID)
			}
			c.mu.Unlock()
		}
	}
}

// Close terminates the MCP server subprocess and releases resources.
func (c *MCPStdioClient) Close() {
	if c.stdin != nil {
		c.stdin.Close()
	}
	if c.cmd != nil && c.cmd.Process != nil {
		c.cmd.Process.Kill()
	}
}

// getNextID returns the next unique message ID for request correlation.
func (c *MCPStdioClient) getNextID() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	id := c.messageID
	c.messageID++
	return id
}
