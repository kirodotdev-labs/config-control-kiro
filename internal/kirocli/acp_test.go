package kirocli

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"testing"
	"time"
)

// fakeACP plays Kiro's ACP server: it answers initialize, sends one request of
// its own first, then answers the call with reply (or an error when fail is set).
func fakeACP(t *testing.T, seen *[]map[string]any, reply string, fail string) ACPPipe {
	return func(ctx context.Context, bin, dir string, args []string) (io.WriteCloser, io.Reader, func(), error) {
		if strings.Join(args, " ") != "acp --agent-engine v3" || dir != "/work" {
			t.Errorf("started with %v in %s", args, dir)
		}
		inR, inW := io.Pipe()
		outR, outW := io.Pipe()
		go func() {
			sc := bufio.NewScanner(inR)
			for sc.Scan() {
				var m map[string]any
				_ = json.Unmarshal(sc.Bytes(), &m)
				*seen = append(*seen, m)
				switch m["method"] {
				case "initialize":
					_, _ = io.WriteString(outW, `{"jsonrpc":"2.0","method":"_kiro/notice","params":{}}`+"\n")
					_, _ = io.WriteString(outW, `{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1}}`+"\n")
				case nil: // our answer to Kiro's own request: now answer the call
					if fail != "" {
						_, _ = io.WriteString(outW, `{"jsonrpc":"2.0","id":2,"error":{"code":-32603,"message":"Internal error","data":{"details":"`+fail+`"}}}`+"\n")
					} else {
						_, _ = io.WriteString(outW, `{"jsonrpc":"2.0","id":2,"result":`+reply+`}`+"\n")
					}
				default: // the call: first Kiro asks something of its own
					_, _ = io.WriteString(outW, `{"jsonrpc":"2.0","id":"k1","method":"fs/read_text_file","params":{}}`+"\n")
				}
			}
		}()
		return inW, outR, func() { _ = inW.Close(); _ = outW.Close() }, nil
	}
}

func TestCallACP(t *testing.T) {
	var seen []map[string]any
	r := &Runner{Find: func() string { return "kiro-cli" }, Pipe: fakeACP(t, &seen, `{"id":"m1"}`, "")}
	got, err := r.CallACP(context.Background(), 5*time.Second, "/work", "_kiro/memory/create", map[string]any{"title": "x"})
	if err != nil || string(got) != `{"id":"m1"}` {
		t.Fatalf("got %s %v", got, err)
	}
	if len(seen) != 3 || seen[0]["method"] != "initialize" || seen[1]["method"] != "_kiro/memory/create" {
		t.Errorf("sent: %v", seen)
	}
	if e, _ := seen[2]["error"].(map[string]any); e == nil || seen[2]["id"] != "k1" {
		t.Errorf("Kiro's own request is answered method not found: %v", seen[2])
	}

	t.Run("Kiro's refusal comes back as its message", func(t *testing.T) {
		var s []map[string]any
		r := &Runner{Find: func() string { return "kiro-cli" }, Pipe: fakeACP(t, &s, "", "Memory is not enabled.")}
		_, err := r.CallACP(context.Background(), 5*time.Second, "/work", "_kiro/memory/create", nil)
		var ae *ACPError
		if !errors.As(err, &ae) || ae.Message != "Memory is not enabled." {
			t.Errorf("got %v", err)
		}
	})
	t.Run("not installed", func(t *testing.T) {
		r := &Runner{Find: func() string { return "" }}
		var p *Problem
		if _, err := r.CallACP(context.Background(), time.Second, "/work", "x", nil); !errors.As(err, &p) || p.Code != NotInstalled {
			t.Errorf("got %v", err)
		}
	})
}
