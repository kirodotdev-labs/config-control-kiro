package performance

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

// setupTestService creates a Service rooted at a temp home directory.
// Session files can then be written under <tempHome>/.kiro/sessions/cli/.
func setupTestService(t *testing.T) (*Service, string) {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("HOME", dir)

	logger := utils.NewLogger()
	kiroSvc := system.NewKiroService(logger, "test")
	if err := os.MkdirAll(filepath.Join(dir, ".kiro", "sessions", "cli"), 0755); err != nil {
		t.Fatalf("mkdir sessions: %v", err)
	}
	return NewService(kiroSvc, logger), dir
}

// writeSession writes a JSONL session file with the given records to
// <homeDir>/.kiro/sessions/cli/<name>.jsonl.
func writeSession(t *testing.T, homeDir, name string, records []map[string]interface{}) string {
	t.Helper()
	path := filepath.Join(homeDir, ".kiro", "sessions", "cli", name+".jsonl")
	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("create %s: %v", path, err)
	}
	defer f.Close()
	enc := json.NewEncoder(f)
	for _, rec := range records {
		if err := enc.Encode(rec); err != nil {
			t.Fatalf("encode: %v", err)
		}
	}
	return path
}

// promptRecord builds a Prompt JSONL record.
func promptRecord(ts int64, text string) map[string]interface{} {
	return map[string]interface{}{
		"version": "v1",
		"kind":    "Prompt",
		"data": map[string]interface{}{
			"content": []map[string]interface{}{
				{"kind": "text", "data": text},
			},
			"meta": map[string]interface{}{"timestamp": ts},
		},
	}
}

// assistantRecord builds an AssistantMessage JSONL record with an
// optional thinking-block modelId and a number of toolUse blocks.
func assistantRecord(modelID string, toolCalls int) map[string]interface{} {
	content := []map[string]interface{}{}
	if modelID != "" {
		content = append(content, map[string]interface{}{
			"kind": "thinking",
			"data": map[string]interface{}{"text": "reasoning...", "modelId": modelID},
		})
	}
	content = append(content, map[string]interface{}{"kind": "text", "data": "response"})
	for i := 0; i < toolCalls; i++ {
		content = append(content, map[string]interface{}{
			"kind": "toolUse",
			"data": map[string]interface{}{"toolUseId": fmt.Sprintf("t%d", i), "name": "SomeTool", "input": map[string]interface{}{}},
		})
	}
	return map[string]interface{}{
		"version": "v1",
		"kind":    "AssistantMessage",
		"data":    map[string]interface{}{"content": content},
	}
}

func TestReadSummary_Empty(t *testing.T) {
	svc, _ := setupTestService(t)
	summary, err := svc.ReadSummary("all")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if summary.Sessions != 0 || summary.Prompts != 0 || summary.AssistantMessages != 0 || summary.ToolCalls != 0 {
		t.Errorf("expected empty summary, got %+v", summary)
	}
	if len(summary.Models) != 0 {
		t.Errorf("expected no models, got %v", summary.Models)
	}
}

func TestReadSummary_MissingDirectory(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("HOME", dir)
	logger := utils.NewLogger()
	kiroSvc := system.NewKiroService(logger, "test")
	svc := NewService(kiroSvc, logger)

	// sessions/ dir was never created; ReadSummary must still succeed.
	summary, err := svc.ReadSummary("all")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if summary.Sessions != 0 {
		t.Errorf("expected 0 sessions, got %d", summary.Sessions)
	}
}

func TestReadSummary_CountsAndModels(t *testing.T) {
	svc, home := setupTestService(t)
	now := time.Now().Unix()

	// Session A: 2 prompts, 2 assistant turns (claude-opus-4.7, claude-opus-5), 3 tool calls total.
	writeSession(t, home, "sess-a", []map[string]interface{}{
		promptRecord(now-60, "hi"),
		assistantRecord("claude-opus-4.7", 1),
		promptRecord(now-30, "more"),
		assistantRecord("claude-opus-5", 2),
	})
	// Session B: 1 prompt, 1 assistant turn using claude-opus-4.7 again.
	writeSession(t, home, "sess-b", []map[string]interface{}{
		promptRecord(now-10, "quick"),
		assistantRecord("claude-opus-4.7", 0),
	})

	summary, err := svc.ReadSummary("24h")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if summary.Sessions != 2 {
		t.Errorf("sessions: want 2, got %d", summary.Sessions)
	}
	if summary.Prompts != 3 {
		t.Errorf("prompts: want 3, got %d", summary.Prompts)
	}
	if summary.AssistantMessages != 3 {
		t.Errorf("assistant messages: want 3, got %d", summary.AssistantMessages)
	}
	if summary.ToolCalls != 3 {
		t.Errorf("tool calls: want 3, got %d", summary.ToolCalls)
	}
	if len(summary.Models) != 2 {
		t.Fatalf("models: want 2 distinct, got %v", summary.Models)
	}
	// claude-opus-4.7 was used twice; it must come first (descending count).
	if summary.Models[0].ModelID != "claude-opus-4.7" || summary.Models[0].Count != 2 {
		t.Errorf("top model: want claude-opus-4.7 x2, got %+v", summary.Models[0])
	}
	if summary.Models[1].ModelID != "claude-opus-5" || summary.Models[1].Count != 1 {
		t.Errorf("second model: want claude-opus-5 x1, got %+v", summary.Models[1])
	}
}

func TestReadSummary_WindowExcludesOldRecords(t *testing.T) {
	svc, home := setupTestService(t)
	now := time.Now().Unix()
	oneWeekAgo := now - 8*24*60*60

	writeSession(t, home, "old", []map[string]interface{}{
		promptRecord(oneWeekAgo, "old prompt"),
		assistantRecord("claude-opus-4.7", 0),
	})
	writeSession(t, home, "new", []map[string]interface{}{
		promptRecord(now-60, "new prompt"),
		assistantRecord("claude-opus-5", 0),
	})

	summary, err := svc.ReadSummary("24h")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if summary.Prompts != 1 {
		t.Errorf("24h window: want 1 prompt, got %d", summary.Prompts)
	}
	if summary.AssistantMessages != 1 {
		t.Errorf("24h window: want 1 assistant, got %d", summary.AssistantMessages)
	}
	if len(summary.Models) != 1 || summary.Models[0].ModelID != "claude-opus-5" {
		t.Errorf("24h window: want only claude-opus-5, got %v", summary.Models)
	}

	// window=all must include the old record.
	all, err := svc.ReadSummary("all")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if all.Prompts != 2 {
		t.Errorf("all window: want 2 prompts, got %d", all.Prompts)
	}
}

func TestReadRecent_NewestFirst(t *testing.T) {
	svc, home := setupTestService(t)
	now := time.Now().Unix()

	writeSession(t, home, "sess-a", []map[string]interface{}{
		promptRecord(now-300, "first prompt"),
		assistantRecord("claude-opus-4.7", 1),
		promptRecord(now-30, "third prompt"),
		assistantRecord("claude-opus-5", 0),
	})
	writeSession(t, home, "sess-b", []map[string]interface{}{
		promptRecord(now-120, "second prompt"),
		assistantRecord("claude-opus-4.7", 2),
	})

	turns, err := svc.ReadRecent("24h", 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(turns) != 3 {
		t.Fatalf("want 3 turns, got %d", len(turns))
	}
	// Newest first.
	if turns[0].Timestamp <= turns[1].Timestamp || turns[1].Timestamp <= turns[2].Timestamp {
		t.Errorf("turns not sorted newest-first: %v", turns)
	}
	if turns[0].Model != "claude-opus-5" {
		t.Errorf("newest turn model: want claude-opus-5, got %q", turns[0].Model)
	}
	if turns[0].Preview != "third prompt" {
		t.Errorf("newest turn preview: want 'third prompt', got %q", turns[0].Preview)
	}
	if turns[0].SessionID != "sess-a" {
		t.Errorf("newest turn session: want sess-a, got %q", turns[0].SessionID)
	}
	if turns[1].ToolCalls != 2 {
		t.Errorf("second turn tool calls: want 2, got %d", turns[1].ToolCalls)
	}
}

func TestReadRecent_LimitEnforced(t *testing.T) {
	svc, home := setupTestService(t)
	now := time.Now().Unix()

	records := []map[string]interface{}{}
	for i := 0; i < 20; i++ {
		records = append(records, promptRecord(now-int64(20-i)*60, fmt.Sprintf("p%d", i)))
		records = append(records, assistantRecord("claude-opus-4.7", 0))
	}
	writeSession(t, home, "busy", records)

	turns, err := svc.ReadRecent("24h", 5)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(turns) != 5 {
		t.Errorf("want 5 turns, got %d", len(turns))
	}
}

func TestReadRecent_MissingModel(t *testing.T) {
	svc, home := setupTestService(t)
	now := time.Now().Unix()

	// No thinking block => model attribution empty.
	writeSession(t, home, "sess-nomodel", []map[string]interface{}{
		promptRecord(now-10, "hi"),
		assistantRecord("", 0),
	})

	turns, err := svc.ReadRecent("24h", 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(turns) != 1 {
		t.Fatalf("want 1 turn, got %d", len(turns))
	}
	if turns[0].Model != "" {
		t.Errorf("expected empty model, got %q", turns[0].Model)
	}
}

func TestWindowSeconds(t *testing.T) {
	cases := map[string]int64{
		"":     24 * 3600,
		"24h":  24 * 3600,
		"1d":   24 * 3600,
		"7d":   7 * 24 * 3600,
		"30d":  30 * 24 * 3600,
		"all":  0,
		"junk": 24 * 3600,
	}
	for in, want := range cases {
		if got := windowSeconds(in); got != want {
			t.Errorf("windowSeconds(%q) = %d, want %d", in, got, want)
		}
	}
}


func TestReadRecent_CarriesForwardModelWithinSession(t *testing.T) {
	svc, home := setupTestService(t)
	now := time.Now().Unix()

	// Simulate one Kiro turn producing three AssistantMessage records:
	// only the first carries thinking.modelId. Continuation records must
	// inherit that modelId so they are not falsely marked unknown.
	writeSession(t, home, "sess-carryfwd", []map[string]interface{}{
		promptRecord(now-30, "hi"),
		assistantRecord("claude-opus-4.7", 1), // has thinking
		assistantRecord("", 0),                // continuation, no thinking
		assistantRecord("", 0),                // continuation, no thinking
	})

	turns, err := svc.ReadRecent("24h", 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(turns) != 3 {
		t.Fatalf("want 3 turns, got %d", len(turns))
	}
	for i, tr := range turns {
		if tr.Model != "claude-opus-4.7" {
			t.Errorf("turn %d: want claude-opus-4.7, got %q", i, tr.Model)
		}
	}
}

func TestReadRecent_LeadingUnknownStaysUnknown(t *testing.T) {
	svc, home := setupTestService(t)
	now := time.Now().Unix()

	// First AssistantMessage has no thinking and no prior model in the
	// session, so it must stay empty rather than borrow from thin air.
	// Each assistant record gets its own preceding prompt so their
	// timestamps differ and the sort is deterministic.
	writeSession(t, home, "sess-lead-unknown", []map[string]interface{}{
		promptRecord(now-60, "first prompt"),
		assistantRecord("", 0),
		promptRecord(now-30, "second prompt"),
		assistantRecord("claude-opus-5", 0),
	})

	turns, err := svc.ReadRecent("24h", 10)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(turns) != 2 {
		t.Fatalf("want 2 turns, got %d", len(turns))
	}
	// turns[0] is the newer AssistantMessage (with model), turns[1] is the older leading-unknown one.
	if turns[0].Model != "claude-opus-5" {
		t.Errorf("newest turn: want claude-opus-5, got %q", turns[0].Model)
	}
	if turns[1].Model != "" {
		t.Errorf("leading turn without prior model must stay empty, got %q", turns[1].Model)
	}
}

func TestReadSummary_CarryforwardCreditsContinuations(t *testing.T) {
	svc, home := setupTestService(t)
	now := time.Now().Unix()

	writeSession(t, home, "sess", []map[string]interface{}{
		promptRecord(now-30, "hi"),
		assistantRecord("claude-opus-4.7", 0),
		assistantRecord("", 0),
		assistantRecord("", 0),
	})

	summary, err := svc.ReadSummary("24h")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(summary.Models) != 1 {
		t.Fatalf("want 1 model bucket, got %v", summary.Models)
	}
	if summary.Models[0].ModelID != "claude-opus-4.7" || summary.Models[0].Count != 3 {
		t.Errorf("want claude-opus-4.7 x3, got %+v", summary.Models[0])
	}
}
