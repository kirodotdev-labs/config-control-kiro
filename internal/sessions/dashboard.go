package sessions

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

// dashboard is what Kiro's V3 session dashboard (/sessions) keeps about each
// chat: a bookmark, tags, and a title the user gave it. Kiro stores it in
// <home>/sessions/dashboard-meta.json, keyed "<engine>\x00<local|remote>\x00<id
// without sess_>". This app only reads it; changes are made in /sessions.
type dashboard map[string]dashboardEntry

type dashboardEntry struct {
	Bookmarked bool     `json:"bookmarked"`
	Tags       []string `json:"tags"`
	Title      string   `json:"title"`
	Archived   bool     `json:"archived"`
}

// readDashboard reads Kiro's dashboard file; a missing or unreadable one is empty.
func readDashboard(home string) dashboard {
	data, err := os.ReadFile(filepath.Join(home, "sessions", "dashboard-meta.json"))
	if err != nil {
		return nil
	}
	var d dashboard
	if json.Unmarshal(data, &d) != nil {
		return nil
	}
	return d
}

// apply adds Kiro's bookmark, tags and title to a local V3 chat.
func (d dashboard) apply(s *Session) {
	e, ok := d["v3\x00local\x00"+strings.TrimPrefix(s.ID, "sess_")]
	if !ok {
		return
	}
	s.Bookmarked = e.Bookmarked
	if title := strings.TrimSpace(e.Title); title != "" {
		s.Title = clip(title)
	}
	for _, t := range e.Tags {
		if t = strings.TrimSpace(t); t != "" {
			s.KiroTags = append(s.KiroTags, t)
		}
	}
}
