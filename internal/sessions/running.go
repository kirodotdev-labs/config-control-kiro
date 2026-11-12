package sessions

import (
	"time"
)

// RunningCheck is the fast answer to "which chats are open right now".
type RunningCheck struct {
	Running []string  `json:"running"`
	Checked time.Time `json:"checked"`
}

// Running re-checks open chats in milliseconds, without asking kiro-cli. A
// V3 chat is running while Kiro's store marks it in progress and it changed
// recently; 2.x chats use runningV2.
func (s *Service) Running() RunningCheck {
	s.mu.Lock()
	snap := s.cached
	s.mu.Unlock()
	out := RunningCheck{Running: []string{}, Checked: s.now()}
	if snap == nil {
		return out
	}
	for _, x := range snap.list {
		if d, ok := snap.v3Dirs[x.ID]; ok {
			if c, ok := s.v3.read(d, s.now()); ok && c.session.Running {
				out.Running = append(out.Running, x.ID)
			}
			continue
		}
		if runningV2(s.v2Dir(), x, snap.checked) { // 2.x: remove with V2 support
			out.Running = append(out.Running, x.ID)
		}
	}
	return out
}
