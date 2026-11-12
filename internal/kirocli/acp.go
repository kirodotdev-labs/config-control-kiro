package kirocli

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"strings"
	"sync"
	"time"
)

// ACPError is an error Kiro answered a request with: its own message, such as
// "Memory is not enabled." or "create requires title.".
type ACPError struct{ Message string }

func (e *ACPError) Error() string { return e.Message }

// ACPPipe starts `kiro-cli acp` in dir and returns its stdin and stdout; stop
// ends the process. Replaceable so tests never run the real binary.
type ACPPipe func(ctx context.Context, bin, dir string, args []string) (stdin io.WriteCloser, stdout io.Reader, stop func(), err error)

// acpArgs starts Kiro's ACP server on the V3 harness (the flag exists from Kiro CLI 2.36).
var acpArgs = []string{"acp", "--agent-engine", "v3"}

// CallACP runs one request against Kiro's ACP server: it starts `kiro-cli acp`
// in dir, sends initialize, then method with params, and returns the result.
// No session is opened and no prompt is sent, so nothing reaches the model.
// Requests Kiro sends back meanwhile are answered "method not found".
func (r *Runner) CallACP(ctx context.Context, timeout time.Duration, dir, method string, params any) (json.RawMessage, error) {
	bin := r.Find()
	if bin == "" {
		return nil, problem(NotInstalled, "")
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	pipe := r.Pipe
	if pipe == nil {
		pipe = startACP
	}
	stdin, stdout, stop, err := pipe(ctx, bin, dir, acpArgs)
	if err != nil {
		return nil, fmt.Errorf("couldn't start kiro-cli acp: %w", err)
	}
	defer stop()
	c := &acpConn{in: stdin, out: bufio.NewReaderSize(stdout, 64<<10)}
	if _, err := c.call(ctx, 1, "initialize", map[string]any{
		"protocolVersion":    1,
		"clientCapabilities": map[string]any{"fs": map[string]bool{"readTextFile": false, "writeTextFile": false}, "terminal": false},
		"clientInfo":         map[string]string{"name": "cckiro", "title": "Config Control for Kiro"},
	}); err != nil {
		return nil, err
	}
	return c.call(ctx, 2, method, params)
}

type acpConn struct {
	mu  sync.Mutex // one writer at a time: our requests and our replies to Kiro
	in  io.Writer
	out *bufio.Reader
}

func (c *acpConn) send(line []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	_, err := c.in.Write(append(line, '\n'))
	return err
}

type rpcMessage struct {
	ID     *json.RawMessage `json:"id,omitempty"`
	Method string           `json:"method,omitempty"`
	Result json.RawMessage  `json:"result,omitempty"`
	Error  *struct {
		Message string          `json:"message"`
		Data    json.RawMessage `json:"data,omitempty"`
	} `json:"error,omitempty"`
}

// call sends one request and reads lines until its answer arrives.
func (c *acpConn) call(ctx context.Context, id int, method string, params any) (json.RawMessage, error) {
	req, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": id, "method": method, "params": params})
	if err := c.send(req); err != nil {
		return nil, fmt.Errorf("kiro-cli acp stopped: %w", err)
	}
	want := fmt.Sprint(id)
	for {
		line, err := c.out.ReadBytes('\n')
		if ctx.Err() != nil {
			return nil, problem(TimedOut, "")
		}
		if len(bytes.TrimSpace(line)) > 0 {
			var m rpcMessage
			if json.Unmarshal(line, &m) == nil {
				switch {
				case m.Method != "" && m.ID != nil: // a request from Kiro: we offer none
					reply, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": m.ID, "error": map[string]any{"code": -32601, "message": "method not found"}})
					go func() { _ = c.send(reply) }() // never block reading while Kiro waits to write
				case m.Method == "" && m.ID != nil && strings.Trim(string(*m.ID), `"`) == want:
					if m.Error != nil {
						return nil, &ACPError{Message: acpMessage(m.Error.Message, m.Error.Data)}
					}
					return m.Result, nil
				}
			}
		}
		if err != nil {
			if errors.Is(err, io.EOF) {
				return nil, errors.New("kiro-cli acp ended before answering")
			}
			return nil, err
		}
	}
}

// acpMessage prefers a detailed message in the error's data, as Kiro puts its
// own explanation there for some errors.
func acpMessage(msg string, data json.RawMessage) string {
	var d struct {
		Message string `json:"message"`
		Details string `json:"details"`
	}
	if json.Unmarshal(data, &d) == nil {
		if d.Details != "" {
			return d.Details
		}
		if d.Message != "" {
			return d.Message
		}
	}
	return msg
}

// startACP runs kiro-cli acp with piped stdin and stdout; stop closes stdin and
// kills the process (and any children it waits on).
func startACP(ctx context.Context, bin, dir string, args []string) (io.WriteCloser, io.Reader, func(), error) {
	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Dir = dir
	cmd.WaitDelay = 2 * time.Second
	in, err := cmd.StdinPipe()
	if err != nil {
		return nil, nil, nil, err
	}
	out, err := cmd.StdoutPipe()
	if err != nil {
		return nil, nil, nil, err
	}
	if err := cmd.Start(); err != nil {
		return nil, nil, nil, err
	}
	stop := func() {
		_ = in.Close()
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		_ = cmd.Wait()
	}
	return in, out, stop, nil
}
