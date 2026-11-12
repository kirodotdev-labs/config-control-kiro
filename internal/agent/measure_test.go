package agent

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"kiromanager/internal/system"
)

func TestMeasureServers(t *testing.T) {
	svc, home := relationsFixture(t)
	fake := svc.measurer.(*fakeMeasurer)
	_ = os.WriteFile(filepath.Join(home, "agents", "m.json"), []byte(`{"name":"m","tools":["@ok","@bad","@off"],
		"mcpServers":{"ok":{"command":"ok-mcp"},"bad":{"command":"broken"},"off":{"command":"x","disabled":true},"unused":{"command":"u"}}}`), 0o644)

	got, err := svc.MeasureServers("m")
	if err != nil {
		t.Fatal(err)
	}
	sort.Strings(fake.asked)
	if strings.Join(fake.asked, ",") != "bad,ok" {
		t.Errorf("only used, unmeasured servers are started (not off, not unused): %v", fake.asked)
	}
	if strings.Join(got.Measured, ",") != "ok" || got.Failed["bad"] != "command not found" {
		t.Errorf("result: %+v", got)
	}
	if c := linkMapOther(svc.Relations("agent:m"), "MCP server ok"); c == nil || c.Unmeasured || c.Tokens != 10 || c.From != fromAgent {
		t.Errorf("ok now has a size: %+v", c)
	}
	if c := linkMapOther(svc.Relations("agent:m"), "MCP server bad"); c == nil || !c.Unmeasured || c.Problem != "command not found" {
		t.Errorf("bad shows why: %+v", c)
	}

	fake.asked = nil
	again, _ := svc.MeasureServers("m")
	if len(fake.asked) != 0 || again.Failed["bad"] == "" || len(again.Measured) != 0 {
		t.Errorf("a second visit starts nothing: measured ones are known, the failed one waits: %v %+v", fake.asked, again)
	}
	if _, err := svc.MeasureServers("nope"); err == nil {
		t.Error("an unknown agent is an error")
	}
}

func TestMeasureServersUntrustedWorkspace(t *testing.T) {
	svc, home := relationsFixture(t)
	fake := svc.measurer.(*fakeMeasurer)
	_ = os.WriteFile(filepath.Join(home, "settings", "mcp.json"), []byte(`{"mcpServers":{"g":{"command":"g-mcp"}}}`), 0o644)
	ws := t.TempDir()
	_ = os.MkdirAll(filepath.Join(ws, ".kiro", "agents"), 0o755)
	_ = os.MkdirAll(filepath.Join(ws, ".kiro", "settings"), 0o755)
	_ = os.WriteFile(filepath.Join(ws, ".kiro", "settings", "mcp.json"), []byte(`{"mcpServers":{"w":{"command":"w-mcp"}}}`), 0o644)
	_ = os.WriteFile(filepath.Join(ws, ".kiro", "agents", "wa.json"), []byte(`{"name":"wa","includeMcpJson":true,"mcpServers":{"own":{"command":"o"}}}`), 0o644)
	if err := svc.kiro.SetWorkspace(ws); err != nil {
		t.Fatal(err)
	}

	got, _ := svc.MeasureServers("wa")
	if strings.Join(fake.asked, ",") != "g" || got.Skipped["w"] == "" || got.Skipped["own"] == "" {
		t.Errorf("untrusted: only the Global server starts: asked %v, %+v", fake.asked, got)
	}
	if c := linkMapOther(svc.Relations("agent:wa"), "MCP server own"); c == nil || c.Problem != untrustedNote {
		t.Errorf("the reason is shown: %+v", c)
	}

	_ = os.MkdirAll(filepath.Dir(svc.kiro.PermissionsPath()), 0o755)
	_ = os.WriteFile(svc.kiro.PermissionsPath(), []byte("workspaceTrusted: true\n"), 0o644)
	fake.asked = nil
	if _, err := svc.MeasureServers("wa"); err != nil {
		t.Fatal(err)
	}
	sort.Strings(fake.asked)
	if strings.Join(fake.asked, ",") != "own,w" {
		t.Errorf("trusted: the Workspace servers start too: %v", fake.asked)
	}
}

func TestMeasureServersHandler(t *testing.T) {
	svc, home := relationsFixture(t)
	_ = os.WriteFile(filepath.Join(home, "agents", "m.json"), []byte(`{"name":"m","tools":["@ok"],"mcpServers":{"ok":{"command":"ok-mcp"}}}`), 0o644)
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/agents/{name}/measure", NewHandler(svc).MeasureServers)
	for _, tc := range []struct {
		name string
		code int
		body string
	}{{"m", http.StatusOK, `"measured":["ok"]`}, {"nope", http.StatusNotFound, ""}} {
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest("POST", "/api/agents/"+tc.name+"/measure", nil))
		if w.Code != tc.code || !strings.Contains(w.Body.String(), tc.body) {
			t.Errorf("%s: %d %s", tc.name, w.Code, w.Body.String())
		}
	}
}

// linkMapOther returns the context of the Other row with label.
func linkMapOther(r Relations, label string) *Context {
	for _, o := range r.Other {
		if o.Label == label {
			return o.Context
		}
	}
	return nil
}

func TestServerTools(t *testing.T) {
	svc, home := relationsFixture(t)
	fake := svc.measurer.(*fakeMeasurer)
	_ = os.WriteFile(filepath.Join(home, "agents", "st.json"), []byte(`{"name":"st","tools":["@ok"],
		"mcpServers":{"ok":{"command":"ok-mcp","disabledTools":["hidden"]},"new":{"command":"n"},"off":{"command":"x","disabled":true}}}`), 0o644)
	ok := system.MCPLaunch{Command: "ok-mcp"}
	_ = svc.kiro.MCPSizes().Record("ok", ok, system.MCPSize{Tools: map[string]int{"search": 5, "read": 3, "hidden": 1}})
	got, err := svc.ServerTools("st")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(got["ok"], ",") != "read,search" || len(got) != 1 {
		t.Errorf("measured tools, less disabledTools; unmeasured and off servers left out: %v", got)
	}
	if len(fake.asked) != 0 {
		t.Errorf("never starts a server: %v", fake.asked)
	}
	if _, err := svc.ServerTools("nope"); err == nil {
		t.Error("an unknown agent is an error")
	}
}
