package sessions

import (
	"context"
	"fmt"
	"time"

	"kiromanager/internal/shared/utils"
)

// Deleting is a 2.x feature: kiro-cli's --delete-session covers only 2.x
// stores. V3 chats are deleted in Kiro's own session dashboard.

const deleteTimeout = 30 * time.Second

// DeleteResult reports what a delete did.
type DeleteResult struct {
	Deleted []string          `json:"deleted"`
	Skipped map[string]string `json:"skipped"` // id -> why it was left alone
}

// Delete deletes chats with Kiro's own `kiro-cli chat --delete-session <id>`.
// Each id is checked against a fresh listing first: running chats and V3
// chats (which that command doesn't cover; use /sessions in Kiro) are left
// alone, and with onlyEmpty so is any chat that has messages.
func (s *Service) Delete(ids []string, onlyEmpty bool) (DeleteResult, error) {
	res := DeleteResult{Deleted: []string{}, Skipped: map[string]string{}}
	if len(ids) == 0 {
		return res, utils.BadRequest("Choose the chats to delete.", "NO_CHATS")
	}
	ov := s.Overview(true, "")
	if ov.Problem != nil {
		return res, ov.Problem.AppError()
	}
	byID := map[string]Session{}
	for _, x := range ov.Sessions {
		byID[x.ID] = x
	}
	running := map[string]bool{}
	for _, id := range s.Running().Running {
		running[id] = true
	}
	for _, id := range ids {
		x, ok := byID[id]
		switch {
		case !ok:
			res.Skipped[id] = "Kiro no longer lists this chat"
		case onlyEmpty && !x.Empty:
			res.Skipped[id] = "it has messages now"
		case x.Running || running[id]:
			res.Skipped[id] = "it is open in a terminal"
		case x.Engine == "v3":
			res.Skipped[id] = "V3 chats are deleted in Kiro's session dashboard (kiro-cli chat --sessions)"
		default:
			if _, p := s.runner.Run(context.Background(), deleteTimeout, "chat", "--delete-session", id); p != nil {
				res.Skipped[id] = fmt.Sprintf("Kiro couldn't delete it: %s", p.Message)
				continue
			}
			res.Deleted = append(res.Deleted, id)
		}
	}
	_ = s.tags.forget(res.Deleted)
	s.mu.Lock()
	s.cached = nil
	s.mu.Unlock()
	return res, nil
}
