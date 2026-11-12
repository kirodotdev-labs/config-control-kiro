package sessions

import (
	"bytes"
	"context"
	"encoding/json"
	"path/filepath"

	"kiromanager/internal/kirocli"
)

// Kiro CLI 2.x chats (2.x and classic engines) are listed by
// `kiro-cli chat --list-sessions --all-cwds`, which leaves V3 chats out.
// Their usage is read from the 2.x store, <home>/sessions/cli/<id>.json.
// Everything 2.x in this package lives in *_v2.go files.

// v2Store holds what the 2.x source keeps between listings.
type v2Store struct {
	usage usageReader
}

type envelope struct {
	Cwd      string `json:"cwd"`
	Sessions []struct {
		ID       string `json:"sessionId"`
		Source   string `json:"source"`
		Title    string `json:"title"`
		Updated  string `json:"updatedAt"`
		Messages *int   `json:"messageCount"`
		Status   string `json:"status"`
	} `json:"sessions"`
}

// load reads V3 chats from Kiro's V3 store, then asks kiro-cli for the 2.x
// and classic chats. When kiro-cli can't answer, the V3 chats are still
// listed and the problem is reported with them.
// v2Dir is Kiro CLI's 2.x chat store.
func (s *Service) v2Dir() string { return filepath.Join(s.kiroHome(), "sessions", "cli") }

// loadV2 lists the 2.x and classic chats with their usage, skipping ids
// already listed from the V3 store. problem is set when kiro-cli can't list.
func (s *Service) loadV2(seen map[string]bool) ([]Session, map[string]*Usage, *kirocli.Problem) {
	var list []Session
	usages := map[string]*Usage{}
	envs, problem := s.list2x()
	dir := s.v2Dir()
	for _, e := range envs {
		for _, x := range e.Sessions {
			if seen[x.ID] {
				continue // a V3 chat a newer kiro-cli lists too: its store has the details
			}
			ses := Session{ID: x.ID, Title: clip(x.Title), Folder: e.Cwd, Engine: x.Source, UpdatedAt: x.Updated,
				Messages: x.Messages, Running: x.Status == "in_progress", Resume: resumeCommand(x.Source, x.ID)}
			if u := s.v2.usage.read(dir, x.ID); u != nil {
				usages[x.ID] = u
				ses.Agent, ses.Model, ses.Rate, ses.ParentID, ses.Turns, ses.MaxContext = u.Agent, u.Model, u.RateMultiplier, u.ParentID, len(u.Turns), u.MaxContextPct
				if u.HasContext {
					pct := u.ContextPct
					ses.ContextPct = &pct
				}
				total := 0.0
				for _, t := range u.Turns {
					total += t.Credits
				}
				ses.Credits = &total
			}
			ses.Empty = isEmpty(ses, usages[x.ID])
			list = append(list, ses)
		}
	}
	return list, usages, problem
}

// list2x asks kiro-cli for its 2.x and classic chats.
func (s *Service) list2x() ([]envelope, *kirocli.Problem) {
	res, p := s.runner.Run(context.Background(), listTimeout, "chat", "--list-sessions", "--all-cwds", "--format", "json")
	if p != nil {
		return nil, p
	}
	out := res.Stdout
	if i := bytes.IndexByte(out, '['); i > 0 {
		out = out[i:]
	}
	var envs []envelope
	if err := json.Unmarshal(out, &envs); err != nil {
		return nil, &kirocli.Problem{
			Code: kirocli.Failed, Message: "Kiro CLI listed its 2.x chats in a format this app doesn't understand.",
			Fix: "Update Config Control for Kiro, or report this so it can be fixed.", Detail: firstLine(string(out)),
		}
	}
	return envs, nil
}

// noTitle is what Kiro lists for a chat that never got a first message.
const noTitle = "(no title)"

// isEmpty reports a chat nothing was said in: Kiro counted no messages, or
// it has no title and its saved details have no turns.
func isEmpty(s Session, u *Usage) bool {
	if s.Messages != nil {
		return *s.Messages == 0
	}
	untitled := s.Title == "" || s.Title == noTitle
	return untitled && u != nil && len(u.Turns) == 0
}
