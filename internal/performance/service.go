// Package performance surfaces Kiro CLI usage and per-turn model routing
// by parsing the JSONL session logs under ~/.kiro/sessions/.
//
// This package is read-only. It never modifies Kiro CLI state. The
// summary and recent-turn views are computed on demand from the raw
// session files; nothing is cached to disk.
package performance

import (
	"bufio"
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

// Service reads Kiro CLI session logs from disk and produces aggregate
// usage statistics and a per-turn activity feed.
type Service struct {
	logger      *utils.Logger
	kiroService *system.KiroService
}

// NewService creates a new performance Service.
func NewService(kiroService *system.KiroService, logger *utils.Logger) *Service {
	return &Service{logger: logger, kiroService: kiroService}
}

// ModelUsage is the number of assistant turns attributed to a given model.
type ModelUsage struct {
	ModelID string `json:"modelId"`
	Count   int    `json:"count"`
}

// Summary is the aggregate response for GET /api/performance/summary.
type Summary struct {
	Window            string       `json:"window"`
	Sessions          int          `json:"sessions"`
	Prompts           int          `json:"prompts"`
	AssistantMessages int          `json:"assistantMessages"`
	ToolCalls         int          `json:"toolCalls"`
	Models            []ModelUsage `json:"models"`
	FirstActivity     int64        `json:"firstActivity,omitempty"`
	LastActivity      int64        `json:"lastActivity,omitempty"`
}

// Turn is one row in the recent-activity feed.
type Turn struct {
	Timestamp int64  `json:"timestamp"`
	SessionID string `json:"sessionId"`
	Model     string `json:"model"`
	ToolCalls int    `json:"toolCalls"`
	Preview   string `json:"preview"`
}

// windowSeconds maps a window token to a lookback duration in seconds.
// The zero return value indicates "no lower bound" (i.e. window="all").
func windowSeconds(window string) int64 {
	switch strings.ToLower(strings.TrimSpace(window)) {
	case "24h", "1d", "":
		return 24 * 60 * 60
	case "7d":
		return 7 * 24 * 60 * 60
	case "30d":
		return 30 * 24 * 60 * 60
	case "all":
		return 0
	}
	return 24 * 60 * 60
}

// sessionsDir returns the root directory containing all Kiro CLI session
// logs. Session data is always stored under the user's home ~/.kiro,
// regardless of which workspace the config manager is currently viewing.
func (s *Service) sessionsDir() string {
	return filepath.Join(s.kiroService.GetGlobalConfigPath(), "sessions")
}

// listSessionFiles walks the sessions directory and returns every .jsonl
// file it finds, sorted newest first by modification time. A missing
// directory yields an empty list rather than an error so a fresh Kiro
// install (with no sessions yet) produces empty stats instead of a 500.
func (s *Service) listSessionFiles() ([]string, error) {
	root := s.sessionsDir()
	if _, err := os.Stat(root); errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}

	type entry struct {
		path    string
		modTime time.Time
	}
	var entries []entry

	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			// Ignore directories we cannot enter; keep scanning the rest.
			return nil
		}
		if d.IsDir() || !strings.HasSuffix(d.Name(), ".jsonl") {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return nil
		}
		entries = append(entries, entry{path: path, modTime: info.ModTime()})
		return nil
	})
	if err != nil {
		return nil, err
	}

	sort.Slice(entries, func(i, j int) bool {
		return entries[i].modTime.After(entries[j].modTime)
	})
	paths := make([]string, len(entries))
	for i, e := range entries {
		paths[i] = e.path
	}
	return paths, nil
}

// rawRecord is the outer envelope of every JSONL line in a session file.
// The three top-level fields ({version, kind, data}) are stable across
// session versions v1 and later; the shape of `data` varies by `kind`.
type rawRecord struct {
	Kind string          `json:"kind"`
	Data json.RawMessage `json:"data"`
}

// promptData is the payload of a Prompt record.
type promptData struct {
	Content []struct {
		Kind string          `json:"kind"`
		Data json.RawMessage `json:"data"`
	} `json:"content"`
	Meta struct {
		Timestamp int64 `json:"timestamp"`
	} `json:"meta"`
}

// assistantData is the payload of an AssistantMessage record.
type assistantData struct {
	Content []struct {
		Kind string          `json:"kind"`
		Data json.RawMessage `json:"data"`
	} `json:"content"`
}

// thinkingData is the payload of a thinking content item. modelId is the
// ground-truth for which model Kiro routed the turn to, including when
// the model selector is set to Auto.
type thinkingData struct {
	ModelID string `json:"modelId"`
}

// scanBufferMax caps the maximum JSONL line the scanner will read.
// Assistant messages with large tool results can be several megabytes;
// 32 MB is a comfortable upper bound.
const scanBufferMax = 32 * 1024 * 1024

// makeScanner returns a bufio.Scanner configured for large JSONL lines.
func makeScanner(f *os.File) *bufio.Scanner {
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 1024*1024), scanBufferMax)
	return sc
}

// firstLine returns the first non-empty line of s, trimmed and truncated.
// This is used to build the preview column for the recent-activity feed.
func firstLine(s string, max int) string {
	for _, line := range strings.Split(s, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if len(line) > max {
			return line[:max] + "..."
		}
		return line
	}
	return ""
}

// promptText walks the content array of a Prompt record and returns the
// first `text` block. Non-text content (images, files) is skipped.
func promptText(p promptData) string {
	for _, c := range p.Content {
		if c.Kind != "text" {
			continue
		}
		var raw string
		if err := json.Unmarshal(c.Data, &raw); err == nil {
			return raw
		}
	}
	return ""
}

// firstModelID walks the content array of an AssistantMessage and
// returns the modelId from the first thinking block, or "" if none.
func firstModelID(a assistantData) string {
	for _, c := range a.Content {
		if c.Kind != "thinking" {
			continue
		}
		var t thinkingData
		if err := json.Unmarshal(c.Data, &t); err == nil && t.ModelID != "" {
			return t.ModelID
		}
	}
	return ""
}

// toolCallCount returns the number of toolUse blocks in an AssistantMessage.
func toolCallCount(a assistantData) int {
	n := 0
	for _, c := range a.Content {
		if c.Kind == "toolUse" {
			n++
		}
	}
	return n
}

// sessionIDFromPath derives a display id from a session file path.
// For flat CLI sessions this is the UUID basename; for workspace-scoped
// sessions the last path segment (sess_<uuid>) is used.
func sessionIDFromPath(path string) string {
	base := strings.TrimSuffix(filepath.Base(path), ".jsonl")
	return base
}

// ReadSummary aggregates prompt, assistant, and tool-call counts, plus
// the per-model share, across all sessions within the given window.
func (s *Service) ReadSummary(window string) (*Summary, error) {
	files, err := s.listSessionFiles()
	if err != nil {
		return nil, err
	}

	lookback := windowSeconds(window)
	now := time.Now().Unix()
	var cutoff int64
	if lookback > 0 {
		cutoff = now - lookback
	}

	summary := &Summary{Window: window, Models: []ModelUsage{}}
	modelCounts := make(map[string]int)
	activeSessions := 0

	for _, path := range files {
		hits, first, last, err := s.scanSummaryFile(path, cutoff)
		if err != nil {
			// One bad file must not fail the whole page.
			s.logger.Warn("performance: skipping %s: %v", path, err)
			continue
		}
		if hits.prompts == 0 && hits.assistantMsgs == 0 && hits.toolCalls == 0 {
			continue
		}
		activeSessions++
		summary.Prompts += hits.prompts
		summary.AssistantMessages += hits.assistantMsgs
		summary.ToolCalls += hits.toolCalls
		for k, v := range hits.models {
			modelCounts[k] += v
		}
		if first > 0 && (summary.FirstActivity == 0 || first < summary.FirstActivity) {
			summary.FirstActivity = first
		}
		if last > summary.LastActivity {
			summary.LastActivity = last
		}
	}

	summary.Sessions = activeSessions
	for id, count := range modelCounts {
		summary.Models = append(summary.Models, ModelUsage{ModelID: id, Count: count})
	}
	sort.Slice(summary.Models, func(i, j int) bool {
		return summary.Models[i].Count > summary.Models[j].Count
	})
	return summary, nil
}

// fileHits collects per-file counters used to build a Summary.
type fileHits struct {
	prompts       int
	assistantMsgs int
	toolCalls     int
	models        map[string]int
}

// scanSummaryFile parses one JSONL session file and returns its
// contribution to the summary within the given cutoff. cutoff == 0 means
// no lower bound (window="all"). The returned first/last timestamps
// cover only records inside the cutoff.
func (s *Service) scanSummaryFile(path string, cutoff int64) (fileHits, int64, int64, error) {
	f, err := os.Open(path) //nolint:gosec // path is discovered by our own WalkDir under a fixed root.
	if err != nil {
		return fileHits{}, 0, 0, err
	}
	defer f.Close()

	hits := fileHits{models: make(map[string]int)}
	var firstTS, lastTS int64
	var currentTS int64
	// lastModel carries the most recent modelId observed inside this
	// session so continuation AssistantMessages (records without a fresh
	// thinking block) are still attributed to the model that produced
	// them. Reset happens naturally because each file gets its own scan.
	var lastModel string

	sc := makeScanner(f)
	for sc.Scan() {
		line := sc.Bytes()
		if len(line) == 0 {
			continue
		}
		var rec rawRecord
		if err := json.Unmarshal(line, &rec); err != nil {
			continue
		}
		switch rec.Kind {
		case "Prompt":
			var pd promptData
			if err := json.Unmarshal(rec.Data, &pd); err != nil {
				continue
			}
			currentTS = pd.Meta.Timestamp
			if cutoff > 0 && currentTS < cutoff {
				continue
			}
			hits.prompts++
			if firstTS == 0 || currentTS < firstTS {
				firstTS = currentTS
			}
			if currentTS > lastTS {
				lastTS = currentTS
			}
		case "AssistantMessage":
			if cutoff > 0 && currentTS != 0 && currentTS < cutoff {
				continue
			}
			var ad assistantData
			if err := json.Unmarshal(rec.Data, &ad); err != nil {
				continue
			}
			hits.assistantMsgs++
			m := firstModelID(ad)
			if m != "" {
				lastModel = m
			} else {
				m = lastModel
			}
			if m != "" {
				hits.models[m]++
			}
			hits.toolCalls += toolCallCount(ad)
		}
	}
	if err := sc.Err(); err != nil {
		return hits, firstTS, lastTS, err
	}
	return hits, firstTS, lastTS, nil
}

// ReadRecent returns the most recent assistant turns within the window,
// newest first, capped at limit. Each turn is paired with the preview
// text of its immediately preceding prompt (best-effort).
func (s *Service) ReadRecent(window string, limit int) ([]Turn, error) {
	if limit <= 0 {
		limit = 200
	}

	files, err := s.listSessionFiles()
	if err != nil {
		return nil, err
	}

	lookback := windowSeconds(window)
	now := time.Now().Unix()
	var cutoff int64
	if lookback > 0 {
		cutoff = now - lookback
	}

	var turns []Turn
	// Files are already sorted newest-first; iterate in that order and
	// stop early once we have plenty of candidates.
	for _, path := range files {
		fileTurns, err := s.scanRecentFile(path, cutoff)
		if err != nil {
			s.logger.Warn("performance: skipping %s: %v", path, err)
			continue
		}
		turns = append(turns, fileTurns...)
		// Rough short-circuit: 4x the limit gives us headroom after the
		// final descending timestamp sort.
		if len(turns) >= limit*4 {
			break
		}
	}

	sort.Slice(turns, func(i, j int) bool {
		return turns[i].Timestamp > turns[j].Timestamp
	})
	if len(turns) > limit {
		turns = turns[:limit]
	}
	if turns == nil {
		turns = []Turn{}
	}
	return turns, nil
}

// scanRecentFile parses one JSONL session file and produces one Turn per
// assistant response within cutoff. Preview text is taken from the most
// recent preceding Prompt record.
func (s *Service) scanRecentFile(path string, cutoff int64) ([]Turn, error) {
	f, err := os.Open(path) //nolint:gosec // path is discovered by our own WalkDir under a fixed root.
	if err != nil {
		return nil, err
	}
	defer f.Close()

	sessionID := sessionIDFromPath(path)
	var out []Turn
	var currentTS int64
	var currentPreview string
	// See scanSummaryFile: last-seen modelId carries across continuation
	// AssistantMessage records within the same session.
	var lastModel string

	sc := makeScanner(f)
	for sc.Scan() {
		line := sc.Bytes()
		if len(line) == 0 {
			continue
		}
		var rec rawRecord
		if err := json.Unmarshal(line, &rec); err != nil {
			continue
		}
		switch rec.Kind {
		case "Prompt":
			var pd promptData
			if err := json.Unmarshal(rec.Data, &pd); err != nil {
				continue
			}
			currentTS = pd.Meta.Timestamp
			currentPreview = firstLine(promptText(pd), 80)
		case "AssistantMessage":
			if cutoff > 0 && currentTS != 0 && currentTS < cutoff {
				continue
			}
			var ad assistantData
			if err := json.Unmarshal(rec.Data, &ad); err != nil {
				continue
			}
			m := firstModelID(ad)
			if m != "" {
				lastModel = m
			} else {
				m = lastModel
			}
			out = append(out, Turn{
				Timestamp: currentTS,
				SessionID: sessionID,
				Model:     m,
				ToolCalls: toolCallCount(ad),
				Preview:   currentPreview,
			})
		}
	}
	if err := sc.Err(); err != nil {
		return out, err
	}
	return out, nil
}
