package sessions

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// lockInfo is Kiro's <id>.lock next to a 2.x chat: the kiro-cli process
// that has the chat open. Kiro leaves the file behind when the chat closes,
// so a lock only means "running" while its process is alive.
type lockInfo struct {
	PID     int    `json:"pid"`
	Started string `json:"started_at"`
}

// runningV2 is the running check for a 2.x chat: Kiro's listing said it was
// running and its kiro-cli process is still alive, or its lock was taken
// after that listing by a live process. Without a readable lock, Kiro's
// answer stands.
func runningV2(dir string, x Session, listed time.Time) bool {
	lock, ok := readLock(dir, x.ID)
	if !ok {
		return x.Running
	}
	return processAlive(lock.PID) && (x.Running || lockedAfter(lock, listed))
}

func readLock(dir, id string) (lockInfo, bool) {
	if !validID(id) {
		return lockInfo{}, false
	}
	data, err := os.ReadFile(filepath.Join(dir, id+".lock"))
	if err != nil {
		return lockInfo{}, false
	}
	var l lockInfo
	if json.Unmarshal(data, &l) != nil || l.PID <= 0 {
		return lockInfo{}, false
	}
	return l, true
}

// lockedAfter reports whether the lock was taken after t, so its process
// id can't be an older process's id reused by the system.
func lockedAfter(l lockInfo, t time.Time) bool {
	started, err := time.Parse(time.RFC3339Nano, strings.TrimSpace(l.Started))
	return err == nil && started.After(t)
}
