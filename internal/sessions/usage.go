package sessions

import (
	"time"
)

// Turn is one finished user turn: when it ended, its model and the credits Kiro metered.
type Turn struct {
	End     time.Time
	Model   string
	Credits float64
}

// Usage is what Kiro recorded for one chat. Only metadata and metering are
// read: never prompts, replies or tool results.
type Usage struct {
	Agent          string
	Model          string
	RateMultiplier float64
	ContextPct     float64
	HasContext     bool
	ParentID       string
	Turns          []Turn
	MaxContextPct  float64
}

// validID accepts Kiro session ids (UUIDs and similar) and nothing that could leave the directory.
func validID(id string) bool {
	if id == "" || len(id) > 100 {
		return false
	}
	for _, c := range id {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-' || c == '_') {
			return false
		}
	}
	return true
}
