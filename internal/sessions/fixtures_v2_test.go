package sessions

import (
	"context"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"kiromanager/internal/kirocli"
)

// Kiro CLI 2.x fixtures: what `chat --list-sessions --all-cwds` prints (it
// never lists V3 chats) and the 2.x store, <home>/sessions/cli/<id>.json.

const listJSON = `[
 {"cwd":"/work/app","complete":true,"sessions":[
  {"sessionId":"aaaa-1","source":"v2","title":"fix   the\nlogin bug","updatedAt":"2026-10-26T10:00:00Z","messageCount":4,"status":"in_progress"},
  {"sessionId":"aaaa-2","source":"v2","title":"subagent work","updatedAt":"2026-10-25T10:00:00Z"}]},
 {"cwd":"/work/api","complete":true,"sessions":[
  {"sessionId":"cccc-4","source":"classic","title":"old one","updatedAt":"2026-03-01T10:00:00Z","messageCount":80},
  {"sessionId":"dddd-5","source":"v2","title":"reviews","updatedAt":"2026-10-20T10:00:00Z"},
  {"sessionId":"eeee-6","source":"v2","title":"(no title)","updatedAt":"2026-10-19T10:00:00Z"},
  {"sessionId":"ffff-7","source":"classic","title":"","updatedAt":"2026-03-01T10:00:00Z","messageCount":0}]}
]`

func file(agent, model string, rate float64, ctx float64, parent string, turns ...string) string {
	p := ""
	if parent != "" {
		p = `"parent_session_id":"` + parent + `",`
	}
	return `{"session_id":"x",` + p + `"title":"secret prompt text","session_state":{"agent_name":"` + agent + `",
	"conversation_metadata":{"last_context_usage":{"percentage":` + ftoa(ctx) + `,"model_id":"` + model + `"},
	"user_turn_metadatas":[` + strings.Join(turns, ",") + `]},
	"rts_model_state":{"model_info":{"model_id":"` + model + `","rate_multiplier":` + ftoa(rate) + `}}}}`
}

func turn(end string, ctx float64, credits ...string) string {
	var m []string
	for _, c := range credits {
		m = append(m, `{"value":`+c+`,"unit":"credit"}`)
	}
	return `{"end_timestamp":"` + end + `","final_context_usage_percentage":` + ftoa(ctx) +
		`,"result":{"Ok":{"content":"reply text"}},"metering_usage":[` + strings.Join(m, ",") + `]}`
}

func ftoa(f float64) string { return strconv.FormatFloat(f, 'f', -1, 64) }

var deleted []string

func fakeRunner(stdout string, prob bool) *kirocli.Runner {
	return &kirocli.Runner{
		Find: func() string { return "/fake/kiro-cli" },
		Exec: func(_ context.Context, _ string, args ...string) (kirocli.Result, error) {
			if len(args) == 3 && args[1] == "--delete-session" {
				deleted = append(deleted, args[2])
				return kirocli.Result{}, nil
			}
			if strings.Join(args, " ") != "chat --list-sessions --all-cwds --format json" {
				return kirocli.Result{ExitCode: 2, Stderr: []byte("error: unexpected argument '--all-cwds'")}, nil
			}
			if prob {
				return kirocli.Result{ExitCode: 2, Stderr: []byte("error: unexpected argument '--all-cwds'")}, nil
			}
			return kirocli.Result{Stdout: []byte(stdout)}, nil
		},
	}
}

// writeV2Store writes the 2.x chats the tests use and returns the store folder.
func writeV2Store(t *testing.T, home string) string {
	t.Helper()
	dir := filepath.Join(home, "sessions", "cli")
	_ = os.MkdirAll(dir, 0o755)
	write := func(id, body string) { _ = os.WriteFile(filepath.Join(dir, id+".json"), []byte(body), 0o644) }
	write("aaaa-1", file("reviewer", "claude-opus", 2, 85, "",
		turn("2026-10-26T09:00:00Z", 60, "2.5", "0.5"), turn("2026-10-26T09:30:00Z", 90, "1")))
	write("aaaa-2", file("reviewer", "claude-opus", 2, 10, "aaaa-1", turn("2026-10-25T10:00:00Z", 10, "4")))
	write("eeee-6", file("", "m", 1, 0, ""))
	write("dddd-5", file("", "claude-sonnet", 1, 20, "", turn("2026-10-20T10:00:00Z", 20, "1.5"), turn("2026-08-01T10:00:00Z", 20, "100")))
	return dir
}
