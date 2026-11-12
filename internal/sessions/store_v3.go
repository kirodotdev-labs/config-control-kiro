package sessions

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Kiro CLI V3 keeps each chat in <home>/sessions/<folder key>/sess_<id>/:
// session.json (title, agent, model, folders, status) and messages.jsonl
// (one event per line). <home>/session-index/<folder key>.jsonl journals
// which chats were added and removed. `kiro-cli chat --list-sessions` lists
// only 2.x and classic chats, so V3 chats are read from these files. Only
// metadata and metering are read, never prompts, replies or tool results.

// v3DefaultMode is the agentMode of a V3 chat with Kiro's default agent.
const v3DefaultMode = "vibe"

// v3LiveWindow is how recently a V3 chat Kiro marks in_progress must have
// changed to count as running; an older one was left behind by a crash.
const v3LiveWindow = 5 * time.Minute

// v3Meta is the part of session.json this app reads.
type v3Meta struct {
	ID         string   `json:"id"`
	Title      string   `json:"title"`
	Agent      string   `json:"agentMode"`
	Folders    []string `json:"workspacePaths"`
	Modified   string   `json:"lastModifiedAt"`
	Model      string   `json:"modelId"`
	ParentID   string   `json:"parentSessionId"`
	Status     string   `json:"status"`
	CreatedFor string   `json:"createdReason"` // human, subagent, tangent or rewind
}

// v3Event is one line of messages.jsonl, reduced to the metering events.
type v3Event struct {
	Timestamp string `json:"timestamp"`
	Payload   struct {
		Type  string `json:"type"`
		Key   string `json:"key"`
		Value struct {
			Pct *float64 `json:"usagePercentage"`
		} `json:"value"`
		Summaries []struct {
			Unit  string  `json:"unit"`
			Usage float64 `json:"usage"`
		} `json:"promptTurnSummaries"`
	} `json:"payload"`
}

// v3Chat is what one V3 chat folder holds.
type v3Chat struct {
	dir     string
	session Session
	usage   *Usage
}

// v3Reader reads V3 chat folders, re-reading only those that changed.
type v3Reader struct {
	mu    sync.Mutex
	cache map[string]v3Cached
}

type v3Cached struct {
	stamp string
	chat  v3Chat
}

// list returns every V3 chat in home that Kiro hasn't removed. now decides
// whether an in_progress chat is still running.
func (r *v3Reader) list(home string, now time.Time) []v3Chat {
	root := filepath.Join(home, "sessions")
	removed := v3Removed(filepath.Join(home, "session-index"))
	buckets, _ := os.ReadDir(root)
	var out []v3Chat
	for _, b := range buckets {
		if !b.IsDir() || b.Name() == "cli" || strings.HasPrefix(b.Name(), ".") {
			continue
		}
		chats, _ := os.ReadDir(filepath.Join(root, b.Name()))
		for _, c := range chats {
			if !c.IsDir() || !strings.HasPrefix(c.Name(), "sess_") || removed[b.Name()+"/"+c.Name()] {
				continue
			}
			if chat, ok := r.read(filepath.Join(root, b.Name(), c.Name()), now); ok {
				out = append(out, chat)
			}
		}
	}
	return out
}

// v3Removed returns the chats the index journals record as removed after
// their last add, as "<folder key>/sess_<id>".
func v3Removed(dir string) map[string]bool {
	removed := map[string]bool{}
	files, _ := filepath.Glob(filepath.Join(dir, "*.jsonl"))
	for _, f := range files {
		data, err := os.ReadFile(f)
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(data), "\n") {
			var e struct {
				Op   string `json:"op"`
				Path string `json:"sessionPath"`
			}
			if json.Unmarshal([]byte(line), &e) != nil || e.Path == "" {
				continue
			}
			removed[filepath.ToSlash(e.Path)] = e.Op == "remove"
		}
	}
	return removed
}

// read loads one chat folder, from the cache while its files are unchanged.
func (r *v3Reader) read(dir string, now time.Time) (v3Chat, bool) {
	metaInfo, err := os.Stat(filepath.Join(dir, "session.json"))
	if err != nil {
		return v3Chat{}, false
	}
	msgInfo, _ := os.Stat(filepath.Join(dir, "messages.jsonl"))
	changed := metaInfo.ModTime()
	stamp := metaInfo.ModTime().String() + "|" + itoa(metaInfo.Size())
	if msgInfo != nil {
		stamp += "|" + msgInfo.ModTime().String() + "|" + itoa(msgInfo.Size())
		if msgInfo.ModTime().After(changed) {
			changed = msgInfo.ModTime()
		}
	}
	r.mu.Lock()
	c, ok := r.cache[dir]
	r.mu.Unlock()
	if !ok || c.stamp != stamp {
		chat, ok := parseV3(dir)
		if !ok {
			return v3Chat{}, false // half-written: try again next time
		}
		chat.dir = dir
		c = v3Cached{stamp: stamp, chat: chat}
		r.mu.Lock()
		if r.cache == nil {
			r.cache = map[string]v3Cached{}
		}
		r.cache[dir] = c
		r.mu.Unlock()
	}
	chat := c.chat
	chat.session.Running = chat.session.Running && now.Sub(changed) < v3LiveWindow
	return chat, true
}

// parseV3 reads session.json and the metering in messages.jsonl.
func parseV3(dir string) (v3Chat, bool) {
	data, err := os.ReadFile(filepath.Join(dir, "session.json"))
	if err != nil {
		return v3Chat{}, false
	}
	var m v3Meta
	if json.Unmarshal(data, &m) != nil || !validID(m.ID) {
		return v3Chat{}, false
	}
	agent := m.Agent
	if agent == v3DefaultMode || agent == "" {
		agent = defaultAgent
	}
	ses := Session{ID: m.ID, Title: clip(m.Title), Engine: "v3", UpdatedAt: m.Modified, Running: m.Status == "in_progress",
		Agent: agent, Model: m.Model, Resume: resumeCommand("v3", m.ID)}
	parent := m.ParentID
	switch m.CreatedFor {
	case "tangent", "rewind":
		// Its own conversation, branched from another: not folded into it.
		ses.Kind, ses.BranchOf, parent = m.CreatedFor, m.ParentID, ""
	}
	ses.ParentID = parent
	if len(m.Folders) > 0 {
		ses.Folder = m.Folders[0]
	}
	u := &Usage{Agent: agent, Model: m.Model, ParentID: parent}
	messages := 0
	if f, err := os.Open(filepath.Join(dir, "messages.jsonl")); err == nil {
		sc := bufio.NewScanner(f)
		sc.Buffer(make([]byte, 64*1024), 16*1024*1024) // a line can hold a large tool result
		for sc.Scan() {
			line := sc.Bytes()
			// Decode only the event types this app uses; the rest may be large.
			if !hasAny(line, `"type":"user"`, `"type":"usage_summary"`, `"key":"contextUsage"`) {
				continue
			}
			var e v3Event
			if json.Unmarshal(line, &e) != nil {
				continue
			}
			switch {
			case e.Payload.Type == "user":
				messages++
			case e.Payload.Type == "usage_summary":
				end, err := time.Parse(time.RFC3339Nano, e.Timestamp)
				if err != nil {
					continue
				}
				turn := Turn{End: end, Model: m.Model}
				for _, s := range e.Payload.Summaries {
					if strings.EqualFold(s.Unit, "credit") {
						turn.Credits += s.Usage
					}
				}
				u.Turns = append(u.Turns, turn)
			case e.Payload.Key == "contextUsage" && e.Payload.Value.Pct != nil:
				u.ContextPct, u.HasContext = *e.Payload.Value.Pct, true
				if u.ContextPct > u.MaxContextPct {
					u.MaxContextPct = u.ContextPct
				}
			}
		}
		f.Close()
	}
	ses.Messages = &messages
	ses.Turns = len(u.Turns)
	ses.MaxContext = u.MaxContextPct
	if u.HasContext {
		pct := u.ContextPct
		ses.ContextPct = &pct
	}
	total := 0.0
	for _, t := range u.Turns {
		total += t.Credits
	}
	ses.Credits = &total
	ses.Empty = messages == 0
	return v3Chat{session: ses, usage: u}, true
}

func hasAny(line []byte, subs ...string) bool {
	s := string(line)
	for _, sub := range subs {
		if strings.Contains(s, sub) {
			return true
		}
	}
	return false
}

func itoa(n int64) string { return strconv.FormatInt(n, 10) }
