package mcp

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"sync"
	"time"
)

// requestTimeout bounds every JSON-RPC round trip to a stdio server.
const requestTimeout = 30 * time.Second

// MCPStdioClient talks JSON-RPC 2.0 to an MCP server subprocess over stdio.
type MCPStdioClient struct {
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout io.ReadCloser

	mu      sync.Mutex
	nextID  int
	pending map[int]chan *MCPResponse
}

// NewMCPStdioClient prepares (but does not start) a client for the server
// command, run in dir as Kiro would (the Workspace folder, or home in Global).
// env is merged over the current process environment.
func NewMCPStdioClient(command string, args []string, env map[string]string, dir string) *MCPStdioClient {
	// #nosec G204 -- command comes from the user's own MCP configuration.
	cmd := exec.Command(command, args...) // nosemgrep: dangerous-exec-command
	cmd.Dir = dir
	cmd.Env = os.Environ()
	for k, v := range env {
		cmd.Env = append(cmd.Env, k+"="+v)
	}
	return &MCPStdioClient{cmd: cmd, nextID: 1, pending: make(map[int]chan *MCPResponse)}
}

// Connect starts the subprocess and performs the initialize handshake.
func (c *MCPStdioClient) Connect() error {
	var err error
	if c.stdin, err = c.cmd.StdinPipe(); err != nil {
		return err
	}
	if c.stdout, err = c.cmd.StdoutPipe(); err != nil {
		return err
	}
	c.cmd.Stderr = io.Discard
	if err := c.cmd.Start(); err != nil {
		return err
	}
	go c.readResponses()
	if _, err := c.call(initializeRequest(c.id())); err != nil {
		return err
	}
	c.notify(MCPRequest{JSONRPC: "2.0", Method: "notifications/initialized"})
	return nil
}

// ListTools returns the tools the server exposes.
func (c *MCPStdioClient) ListTools() ([]MCPTool, error) {
	resp, err := c.call(toolsListRequest(c.id()))
	if err != nil {
		return nil, err
	}
	var result MCPToolsResult
	if err := json.Unmarshal(resp.Result, &result); err != nil {
		return nil, err
	}
	return result.Tools, nil
}

// Close stops the subprocess and reaps it so no zombie is left behind.
func (c *MCPStdioClient) Close() {
	if c.stdin != nil {
		_ = c.stdin.Close()
	}
	if c.cmd.Process != nil {
		_ = c.cmd.Process.Kill()
		_ = c.cmd.Wait()
	}
}

// call sends req and waits for its correlated response.
func (c *MCPStdioClient) call(req MCPRequest) (*MCPResponse, error) {
	ch := make(chan *MCPResponse, 1)
	c.mu.Lock()
	c.pending[req.ID] = ch
	c.mu.Unlock()
	defer func() {
		c.mu.Lock()
		delete(c.pending, req.ID)
		c.mu.Unlock()
	}()

	if err := c.write(req); err != nil {
		return nil, err
	}
	select {
	case resp := <-ch:
		if resp.Error != nil {
			return nil, fmt.Errorf("MCP error: %s", resp.Error.Message)
		}
		return resp, nil
	case <-time.After(requestTimeout):
		return nil, fmt.Errorf("MCP request %q timed out", req.Method)
	}
}

// notify sends a notification (no response expected).
func (c *MCPStdioClient) notify(req MCPRequest) { _ = c.write(req) }

// write sends one newline-delimited JSON message.
func (c *MCPStdioClient) write(req MCPRequest) error {
	data, err := json.Marshal(req)
	if err != nil {
		return err
	}
	_, err = c.stdin.Write(append(data, '\n'))
	return err
}

// readResponses dispatches each stdout line to the waiting caller.
func (c *MCPStdioClient) readResponses() {
	scanner := bufio.NewScanner(c.stdout)
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024) // servers may list many tools
	for scanner.Scan() {
		var resp MCPResponse
		if json.Unmarshal(scanner.Bytes(), &resp) != nil || resp.ID == 0 {
			continue
		}
		c.mu.Lock()
		ch, ok := c.pending[resp.ID]
		c.mu.Unlock()
		if ok {
			ch <- &resp
		}
	}
}

// id returns the next request id.
func (c *MCPStdioClient) id() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	id := c.nextID
	c.nextID++
	return id
}
