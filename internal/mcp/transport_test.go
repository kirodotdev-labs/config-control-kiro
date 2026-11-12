package mcp

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"kiromanager/internal/system"
)

func TestExtractRPCPayload(t *testing.T) {
	plain := []byte(`{"result":{}}`)
	if got := extractRPCPayload(plain); string(got) != string(plain) {
		t.Errorf("plain body changed: %s", got)
	}
	sse := []byte("event: message\ndata: {\"result\":{\"tools\":[]}}\n\n")
	if got := extractRPCPayload(sse); string(got) != `{"result":{"tools":[]}}` {
		t.Errorf("sse payload: %s", got)
	}
	if got := extractRPCPayload([]byte("event: x\n\n")); got != nil {
		t.Errorf("sse without data should be nil, got %s", got)
	}
}

func TestDecodeRPCResult(t *testing.T) {
	var out MCPToolsResult
	if err := decodeRPCResult([]byte(`{"result":{"tools":[{"name":"a"}]}}`), &out); err != nil || len(out.Tools) != 1 {
		t.Fatalf("decode: err=%v tools=%v", err, out.Tools)
	}
	if err := decodeRPCResult([]byte(`{"error":{"code":1,"message":"nope"}}`), &out); err == nil {
		t.Error("rpc error should be returned")
	}
	if err := decodeRPCResult(nil, &out); err == nil {
		t.Error("nil payload should error")
	}
}

func TestHTTPClientListTools(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Key") != "k" {
			http.Error(w, "missing header", http.StatusUnauthorized)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"result": map[string]any{"tools": []map[string]string{{"name": "search"}}}})
	}))
	defer srv.Close()

	tools, err := NewMCPHttpClient(srv.URL, map[string]string{"X-Key": "k"}).ListTools()
	if err != nil || len(tools) != 1 || tools[0].Name != "search" {
		t.Fatalf("ListTools: err=%v tools=%v", err, tools)
	}
	if _, err := NewMCPHttpClient(srv.URL, nil).ListTools(); err == nil {
		t.Error("non-200 should error")
	}
}

func TestGetToolsFromConfig(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"result":{"tools":[{"name":"t1"}]}}`))
	}))
	defer srv.Close()
	svc, _, _ := setupTestService(t)
	got, err := svc.GetToolsFromConfig(map[string]*MCPServerConfig{
		"remote":   {URL: srv.URL},
		"broken":   {Command: "/nonexistent/mcp-server"},
		"disabled": {URL: srv.URL, Disabled: true},
		"nil":      nil,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := got["disabled"]; ok {
		t.Error("disabled server must be skipped")
	}
	if r := got["remote"]; len(r.Tools) != 1 || r.Error != "" {
		t.Errorf("remote tools: %#v", r)
	}
	if b := got["broken"]; b.Error == "" || b.Tools == nil {
		t.Errorf("broken server must report an error and an empty list: %#v", b)
	}
	sizes := svc.kiroService.MCPSizes()
	if size, ok := sizes.Lookup("remote", (&MCPServerConfig{URL: srv.URL}).launch()); !ok || size.Tools["t1"] == 0 {
		t.Errorf("listing tools remembers the server's size: %+v", size)
	}
	if _, ok := sizes.Lookup("broken", (&MCPServerConfig{Command: "/nonexistent/mcp-server"}).launch()); ok {
		t.Error("a server that failed has no size")
	}
}

func TestMeasureTools(t *testing.T) {
	var lists atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if strings.Contains(string(body), "tools/list") {
			lists.Add(1)
			time.Sleep(150 * time.Millisecond) // long enough for the second request to overlap
		}
		_, _ = w.Write([]byte(`{"result":{"tools":[{"name":"t1"}]}}`))
	}))
	defer srv.Close()
	svc, kiro, _ := setupTestService(t)
	launch := system.MCPLaunch{URL: srv.URL}

	var wg sync.WaitGroup
	for range 2 {
		wg.Add(1)
		go func() { defer wg.Done(); svc.MeasureTools(map[string]system.MCPLaunch{"remote": launch}) }()
	}
	wg.Wait()
	if n := lists.Load(); n != 1 {
		t.Errorf("two requests for one server share one listing, got %d", n)
	}
	if _, ok := kiro.MCPSizes().Lookup("remote", launch); !ok {
		t.Error("the size is remembered")
	}

	broken := system.MCPLaunch{Command: "/nonexistent/mcp-server"}
	failed := svc.MeasureTools(map[string]system.MCPLaunch{"broken": broken})
	if failed["broken"] == "" || kiro.MCPSizes().Failure("broken", broken) == "" {
		t.Errorf("a failure is returned and remembered: %v", failed)
	}
}

func TestStdioClientStartsInDir(t *testing.T) {
	dir := t.TempDir()
	if c := NewMCPStdioClient("x", nil, nil, dir); c.cmd.Dir != dir {
		t.Errorf("servers start in the scope folder: %q", c.cmd.Dir)
	}
}
