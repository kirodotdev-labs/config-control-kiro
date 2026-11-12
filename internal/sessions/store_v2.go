package sessions

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// sessionFile is the part of <home>/sessions/cli/<id>.json (Kiro's V2 session
// store) this app reads. Every other field is ignored, so new Kiro fields
// never break it.
type sessionFile struct {
	ParentID string `json:"parent_session_id"`
	State    struct {
		Agent string `json:"agent_name"`
		Meta  struct {
			Last struct {
				Percentage *float64 `json:"percentage"`
				Model      string   `json:"model_id"`
			} `json:"last_context_usage"`
			Turns []struct {
				End     string  `json:"end_timestamp"`
				Model   string  `json:"model"`
				Context float64 `json:"final_context_usage_percentage"`
				Meter   []struct {
					Value float64 `json:"value"`
					Unit  string  `json:"unit"`
				} `json:"metering_usage"`
			} `json:"user_turn_metadatas"`
		} `json:"conversation_metadata"`
		Model struct {
			Info struct {
				ID   string  `json:"model_id"`
				Rate float64 `json:"rate_multiplier"`
			} `json:"model_info"`
			Context *float64 `json:"context_usage_percentage"`
		} `json:"rts_model_state"`
	} `json:"session_state"`
}

func parseUsage(data []byte) (*Usage, bool) {
	var f sessionFile
	if json.Unmarshal(data, &f) != nil {
		return nil, false
	}
	u := &Usage{Agent: f.State.Agent, ParentID: f.ParentID, Model: f.State.Model.Info.ID, RateMultiplier: f.State.Model.Info.Rate}
	if u.Model == "" {
		u.Model = f.State.Meta.Last.Model
	}
	switch {
	case f.State.Meta.Last.Percentage != nil:
		u.ContextPct, u.HasContext = *f.State.Meta.Last.Percentage, true
	case f.State.Model.Context != nil:
		u.ContextPct, u.HasContext = *f.State.Model.Context, true
	}
	u.MaxContextPct = u.ContextPct
	for _, t := range f.State.Meta.Turns {
		end, err := time.Parse(time.RFC3339Nano, t.End)
		if err != nil {
			continue
		}
		turn := Turn{End: end, Model: t.Model}
		for _, m := range t.Meter {
			if strings.EqualFold(m.Unit, "credit") {
				turn.Credits += m.Value
			}
		}
		if t.Context > u.MaxContextPct {
			u.MaxContextPct = t.Context
		}
		u.Turns = append(u.Turns, turn)
	}
	return u, true
}

type cached struct {
	mod   time.Time
	size  int64
	usage *Usage
}

// usageReader reads session files, re-reading only those that changed.
type usageReader struct {
	mu    sync.Mutex
	files map[string]cached
}

// read returns the usage Kiro recorded for session id, or nil when there is
// no readable file (V3 and classic chats, or a file Kiro is still writing).
func (r *usageReader) read(dir, id string) *Usage {
	if !validID(id) {
		return nil
	}
	path := filepath.Join(dir, id+".json")
	info, err := os.Stat(path)
	if err != nil {
		return nil
	}
	r.mu.Lock()
	c, ok := r.files[path]
	r.mu.Unlock()
	if ok && c.mod.Equal(info.ModTime()) && c.size == info.Size() {
		return c.usage
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	u, ok := parseUsage(data)
	if !ok {
		return nil // half-written: try again next time
	}
	r.mu.Lock()
	if r.files == nil {
		r.files = map[string]cached{}
	}
	r.files[path] = cached{mod: info.ModTime(), size: info.Size(), usage: u}
	r.mu.Unlock()
	return u
}
