package sessions

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// rates is the credit multiplier the tests' model list reports.
func rates(model string) float64 {
	if model == "claude-opus" {
		return 2
	}
	return 0
}

// v3Line is one messages.jsonl line, as Kiro CLI V3 writes it.
func v3Line(t *testing.T, ts string, payload map[string]any) string {
	t.Helper()
	b, err := json.Marshal(map[string]any{"id": "m", "timestamp": ts, "payload": payload})
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

// writeV3Chat writes one chat folder in Kiro's V3 store layout (checked
// against a real Kiro CLI 2.34.2 chat): <home>/sessions/<key>/sess_<id>/.
func writeV3Chat(t *testing.T, home, key string, meta map[string]any, lines ...string) string {
	t.Helper()
	dir := filepath.Join(home, "sessions", key, meta["id"].(string))
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	meta["schemaVersion"], meta["dataModelVersion"] = "1.0.0", 1
	data, _ := json.MarshalIndent(meta, "", "  ")
	_ = os.WriteFile(filepath.Join(dir, "session.json"), data, 0o600)
	_ = os.WriteFile(filepath.Join(dir, "messages.jsonl"), []byte(strings.Join(lines, "\n")+"\n"), 0o600)
	return dir
}

// writeV3Store builds the V3 chats the tests use, plus the index journal.
func writeV3Store(t *testing.T, home string) {
	t.Helper()
	user := func(ts string) string {
		return v3Line(t, ts, map[string]any{"type": "user", "content": "SECRET prompt", "documents": []any{}})
	}
	usage := func(ts string, credits float64) string {
		return v3Line(t, ts, map[string]any{"type": "usage_summary", "status": "success", "elapsedTime": 4049, "requestIds": []string{"r1"},
			"promptTurnSummaries": []any{map[string]any{"unit": "credit", "unitPlural": "credits", "usage": credits, "usedTools": []string{"read_file"}}}})
	}
	ctx := func(ts string, pct float64) string {
		return v3Line(t, ts, map[string]any{"type": "session_metadata", "key": "contextUsage", "value": map[string]any{"usagePercentage": pct}})
	}
	reply := v3Line(t, "2026-10-24T10:00:01Z", map[string]any{"type": "assistant", "operationType": "Say", "content": "SECRET reply " + strings.Repeat("x", 200000)})
	writeV3Chat(t, home, "a1b2c3d4e5f60718", map[string]any{"id": "sess_bbbb3", "title": "new engine", "agentMode": "reviewer",
		"workspacePaths": []string{"/work/app"}, "createdAt": "2026-10-24T09:00:00Z", "lastModifiedAt": "2026-10-24T10:00:00Z",
		"modelId": "claude-opus", "status": "idle"},
		user("2026-10-24T09:59:00Z"), reply, ctx("2026-10-24T10:00:00Z", 25), ctx("2026-10-24T10:00:00Z", 40), usage("2026-10-24T10:00:00Z", 1.5))
	writeV3Chat(t, home, "a1b2c3d4e5f60718", map[string]any{"id": "sess_hhhh9", "title": "subagent", "agentMode": "reviewer",
		"workspacePaths": []string{"/work/app"}, "lastModifiedAt": "2026-10-26T08:00:00Z", "modelId": "claude-opus",
		"parentSessionId": "sess_bbbb3", "createdReason": "subagent", "status": "completed"},
		user("2026-10-26T07:59:00Z"), usage("2026-10-26T08:00:00Z", 0.5))
	writeV3Chat(t, home, "0f0f0f0f0f0f0f0f", map[string]any{"id": "sess_gggg8", "title": "New session", "agentMode": "vibe",
		"workspacePaths": []string{"/work/api"}, "lastModifiedAt": "2026-10-18T10:00:00Z", "status": "idle"},
		v3Line(t, "2026-10-18T10:00:00Z", map[string]any{"type": "agent_note", "content": "<session_context/>"}))
	writeV3Chat(t, home, "0f0f0f0f0f0f0f0f", map[string]any{"id": "sess_gone", "title": "deleted in Kiro", "agentMode": "vibe",
		"workspacePaths": []string{"/work/api"}, "lastModifiedAt": "2026-10-19T10:00:00Z"}, user("2026-10-19T10:00:00Z"))
	idx := filepath.Join(home, "session-index")
	_ = os.MkdirAll(idx, 0o700)
	_ = os.WriteFile(filepath.Join(idx, "0f0f0f0f0f0f0f0f.jsonl"), []byte(
		`{"op":"add","sessionPath":"0f0f0f0f0f0f0f0f/sess_gggg8","at":1}`+"\n"+
			`{"op":"add","sessionPath":"0f0f0f0f0f0f0f0f/sess_gone","at":2}`+"\n"+
			`{"op":"remove","sessionPath":"0f0f0f0f0f0f0f0f/sess_gone","at":3}`+"\n"), 0o600)
}

func TestV3Store(t *testing.T) {
	s, _ := setup(t)
	byID := map[string]Session{}
	for _, x := range s.Overview(false, "").Sessions {
		byID[x.ID] = x
	}
	if _, ok := byID["sess_gone"]; ok {
		t.Error("a chat the index journal removed is not listed")
	}
	if d := byID["sess_gggg8"]; d.Agent != defaultAgent || !d.Empty || d.Folder != "/work/api" || *d.Messages != 0 {
		t.Errorf("the vibe mode is Kiro's default agent; no user message means empty: %+v", d)
	}
	if sub := byID["sess_hhhh9"]; sub.ParentID != "sess_bbbb3" || *sub.Credits != 0.5 {
		t.Errorf("subagent chat: %+v", sub)
	}
	for _, x := range byID {
		if strings.Contains(x.Title, "SECRET") {
			t.Fatal("prompts and replies are never read into the list")
		}
	}
}

func TestV3WhenKiroCLICantList(t *testing.T) {
	home := t.TempDir()
	writeV3Store(t, home)
	s := NewService(fakeRunner("", true), func() string { return home }, rates)
	ov := s.Overview(false, "")
	if ov.Problem == nil || len(ov.Sessions) != 3 || ov.Usage.Covered != 3 {
		t.Errorf("V3 chats are listed even when kiro-cli can't list its 2.x chats: %d chats, %+v", len(ov.Sessions), ov.Problem)
	}
}

func TestV3SeenTwice(t *testing.T) {
	home := t.TempDir()
	writeV3Store(t, home)
	list := `[{"cwd":"/work/app","sessions":[{"sessionId":"sess_bbbb3","source":"v3","title":"new engine","updatedAt":"2026-10-24T10:00:00Z"}]}]`
	ov := NewService(fakeRunner(list, false), func() string { return home }, rates).Overview(false, "")
	n := 0
	for _, x := range ov.Sessions {
		if x.ID == "sess_bbbb3" {
			n++
			if x.Credits == nil {
				t.Error("the V3 store's details win")
			}
		}
	}
	if n != 1 {
		t.Errorf("a V3 chat a newer kiro-cli also lists appears once: %d", n)
	}
}

func TestV3Running(t *testing.T) {
	s, _ := setup(t)
	home := s.kiroHome()
	dir := writeV3Chat(t, home, "a1b2c3d4e5f60718", map[string]any{"id": "sess_live", "title": "working", "agentMode": "reviewer",
		"workspacePaths": []string{"/work/app"}, "lastModifiedAt": "2026-10-26T17:59:00Z", "status": "in_progress"})
	now := time.Now()
	s.now = func() time.Time { return now }
	s.Overview(false, "")
	if r := strings.Join(s.Running().Running, ","); !strings.Contains(r, "sess_live") {
		t.Errorf("a V3 chat Kiro marks in progress, changed just now, is running: %v", r)
	}
	old := now.Add(-time.Hour)
	for _, f := range []string{"session.json", "messages.jsonl"} {
		_ = os.Chtimes(filepath.Join(dir, f), old, old)
	}
	if r := strings.Join(s.Running().Running, ","); strings.Contains(r, "sess_live") {
		t.Errorf("one left in progress by a crash an hour ago isn't: %v", r)
	}
	meta, _ := os.ReadFile(filepath.Join(dir, "session.json"))
	_ = os.WriteFile(filepath.Join(dir, "session.json"), []byte(strings.Replace(string(meta), "in_progress", "idle", 1)), 0o600)
	if r := strings.Join(s.Running().Running, ","); strings.Contains(r, "sess_live") {
		t.Errorf("an idle V3 chat isn't running: %v", r)
	}
}

func TestV3TangentsRewindsAndKiroDashboard(t *testing.T) {
	home := t.TempDir()
	writeV3Store(t, home)
	user := v3Line(t, "2026-10-25T09:00:00Z", map[string]any{"type": "user", "content": "x"})
	used := v3Line(t, "2026-10-25T09:00:01Z", map[string]any{"type": "usage_summary", "promptTurnSummaries": []any{map[string]any{"unit": "credit", "usage": 2.0}}})
	writeV3Chat(t, home, "a1b2c3d4e5f60718", map[string]any{"id": "sess_tan1", "title": "ddb", "agentMode": "reviewer",
		"workspacePaths": []string{"/work/app"}, "lastModifiedAt": "2026-10-25T09:00:00Z", "parentSessionId": "sess_bbbb3", "createdReason": "tangent"}, user, used)
	writeV3Chat(t, home, "a1b2c3d4e5f60718", map[string]any{"id": "sess_rew1", "title": "try again", "agentMode": "reviewer",
		"workspacePaths": []string{"/work/app"}, "lastModifiedAt": "2026-10-25T10:00:00Z", "parentSessionId": "sess_bbbb3", "createdReason": "rewind"}, user)
	meta := map[string]any{
		"v3\x00local\x00bbbb3": map[string]any{"bookmarked": true, "tags": []string{"release", " "}, "title": "Renamed in Kiro"},
		"v3\x00remote\x00tan1": map[string]any{"bookmarked": true},
	}
	data, _ := json.Marshal(meta)
	_ = os.WriteFile(filepath.Join(home, "sessions", "dashboard-meta.json"), data, 0o600)

	byID := map[string]Session{}
	for _, x := range NewService(fakeRunner("[]", false), func() string { return home }, rates).Overview(false, "").Sessions {
		byID[x.ID] = x
	}
	if tan := byID["sess_tan1"]; tan.Kind != "tangent" || tan.BranchOf != "sess_bbbb3" || tan.ParentID != "" || *tan.Credits != 2 || tan.Bookmarked {
		t.Errorf("a tangent is its own conversation, not a subagent chat; a remote dashboard entry doesn't apply: %+v", tan)
	}
	if rew := byID["sess_rew1"]; rew.Kind != "rewind" || rew.BranchOf != "sess_bbbb3" || rew.ParentID != "" {
		t.Errorf("rewind: %+v", rew)
	}
	main := byID["sess_bbbb3"]
	if *main.Credits != 2.0 || main.Subagents != 1 {
		t.Errorf("only the subagent chat's credits are added to the parent (1.5 + 0.5): %v, %d", *main.Credits, main.Subagents)
	}
	if !main.Bookmarked || main.Title != "Renamed in Kiro" || strings.Join(main.KiroTags, ",") != "release" {
		t.Errorf("Kiro's dashboard bookmark, title and tags: %+v", main)
	}
	_ = os.WriteFile(filepath.Join(home, "sessions", "dashboard-meta.json"), []byte("{broken"), 0o600)
	if x := NewService(fakeRunner("[]", false), func() string { return home }, rates).Overview(false, ""); len(x.Sessions) != 5 {
		t.Errorf("a broken dashboard file is ignored: %d", len(x.Sessions))
	}
}
