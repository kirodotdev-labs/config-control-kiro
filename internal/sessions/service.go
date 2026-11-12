// Package sessions lists Kiro CLI chats and the credits they used. V3 chats,
// the primary source, are read from Kiro's V3 chat store; 2.x and classic
// chats come from `kiro-cli chat --list-sessions --all-cwds`, with their
// usage read from the metadata Kiro saves with each 2.x chat.
package sessions

import (
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"kiromanager/internal/kirocli"
)

// Session is one Kiro CLI chat.
type Session struct {
	ID         string   `json:"id"`
	Title      string   `json:"title"`
	Folder     string   `json:"folder"`
	Engine     string   `json:"engine"` // v3, v2 or classic, as Kiro reports it
	UpdatedAt  string   `json:"updatedAt"`
	Messages   *int     `json:"messages,omitempty"`
	Empty      bool     `json:"empty"` // nothing was ever said in it
	Tags       []string `json:"tags"`  // the app's labels; Kiro's chat is untouched
	Running    bool     `json:"running"`
	Agent      string   `json:"agent,omitempty"`
	Model      string   `json:"model,omitempty"`
	Rate       float64  `json:"rateMultiplier,omitempty"`
	ContextPct *float64 `json:"contextPct,omitempty"`
	MaxContext float64  `json:"maxContextPct,omitempty"`
	Credits    *float64 `json:"credits,omitempty"` // this chat, including its subagents
	Subagents  int      `json:"subagents,omitempty"`
	ParentID   string   `json:"parentId,omitempty"` // the chat that started this subagent chat
	// Kind is "tangent" (a /tangent side conversation) or "rewind" (a branch
	// made with /rewind), with BranchOf the chat it came from. Unlike a
	// subagent chat, each is a conversation of its own with its own credits.
	Kind     string `json:"kind,omitempty"`
	BranchOf string `json:"branchOf,omitempty"`
	// Bookmarked, KiroTags and a renamed title come from Kiro's session
	// dashboard (/sessions), read-only.
	Bookmarked bool     `json:"bookmarked,omitempty"`
	KiroTags   []string `json:"kiroTags,omitempty"`
	Turns      int      `json:"turns,omitempty"`
	Resume     string   `json:"resumeCommand,omitempty"` // run in Folder
}

// defaultAgent is the name Kiro gives its built-in default agent.
const defaultAgent = "kiro_default"

// engineFlags picks the engine Kiro needs to reopen a chat; the stores of
// V3, 2.x and classic chats are not interchangeable. 2.x: the v2 and classic
// entries go with V2 support.
var engineFlags = map[string]string{"v3": "--v3", "v2": "--v2", "classic": "--legacy-ui"} // 2.x: v2, classic

// resumeCommand is the kiro-cli command that reopens a chat, or "" for an id
// a terminal command can't carry safely.
func resumeCommand(engine, id string) string {
	if !validID(id) {
		return ""
	}
	cmd := "kiro-cli chat"
	if f := engineFlags[engine]; f != "" {
		cmd += " " + f
	}
	return cmd + " --resume-id " + id
}

// Overview is every chat plus usage totals.
type Overview struct {
	Sessions []Session        `json:"sessions"`
	Usage    Totals           `json:"usage"`
	Problem  *kirocli.Problem `json:"problem,omitempty"`
	Checked  time.Time        `json:"checked"`
}

const (
	listTimeout = 90 * time.Second
	listTTL     = 20 * time.Second
	titleMax    = 160
)

// Service reads chats through kiro-cli and caches the answer briefly, since
// listing every workspace takes a few seconds.
type Service struct {
	runner   *kirocli.Runner
	kiroHome func() string
	rate     func(model string) float64 // credit multiplier of a model, 0 when unknown
	now      func() time.Time
	v3       v3Reader
	v2       v2Store // 2.x: Kiro CLI's 2.x chats
	tags     tagStore

	mu     sync.Mutex
	cached *snapshot
}

// snapshot is one listing from kiro-cli plus the usage read for it.
type snapshot struct {
	list    []Session
	v3Dirs  map[string]string // V3 chat id -> its folder in Kiro's store
	usages  map[string]*Usage
	problem *kirocli.Problem
	checked time.Time
}

// NewService creates a Service; kiroHome returns the global Kiro home, and
// rate a model's credit multiplier (V3 chats don't record it).
func NewService(runner *kirocli.Runner, kiroHome func() string, rate func(model string) float64) *Service {
	return &Service{runner: runner, kiroHome: kiroHome, rate: rate, now: time.Now, tags: tagStore{path: tagsPath(kiroHome)}}
}

// Overview lists chats and usage, re-asking kiro-cli when stale or on
// refresh. A non-empty folder keeps only chats started in it or below it.
func (s *Service) Overview(refresh bool, folder string) Overview {
	s.mu.Lock()
	snap := s.cached
	if snap == nil || refresh || s.now().Sub(snap.checked) >= listTTL || snap.problem != nil {
		snap = s.load()
		s.cached = snap
	}
	s.mu.Unlock()
	usages := snap.usages
	tags := s.tags.all()
	dash := readDashboard(s.kiroHome())
	list := make([]Session, 0, len(snap.list))
	for _, x := range snap.list {
		if folder != "" && !inside(x.Folder, folder) {
			continue
		}
		x.Tags = tags[x.ID]
		if x.Tags == nil {
			x.Tags = []string{}
		}
		if x.Engine == "v3" {
			dash.apply(&x)
		}
		list = append(list, x)
	}
	return Overview{Sessions: list, Usage: summarize(list, usages, s.now()), Problem: snap.problem, Checked: snap.checked}
}

func (s *Service) load() *snapshot {
	now := s.now()
	var list []Session
	usages := map[string]*Usage{}
	seen := map[string]bool{}
	v3Dirs := map[string]string{}
	for _, c := range s.v3.list(s.kiroHome(), now) {
		v3Dirs[c.session.ID] = c.dir
		if s.rate != nil {
			c.usage.RateMultiplier = s.rate(c.usage.Model)
			c.session.Rate = c.usage.RateMultiplier
		}
		list = append(list, c.session)
		usages[c.session.ID] = c.usage
		seen[c.session.ID] = true
	}
	// 2.x: chats Kiro CLI lists (2.x and classic); remove with V2 support.
	v2list, v2usages, problem := s.loadV2(seen)
	list = append(list, v2list...)
	for id, u := range v2usages {
		usages[id] = u
	}
	foldSubagents(list)
	sort.SliceStable(list, func(i, j int) bool { return list[i].UpdatedAt > list[j].UpdatedAt })
	if list == nil {
		list = []Session{}
	}
	return &snapshot{list: list, v3Dirs: v3Dirs, usages: usages, problem: problem, checked: now}
}

// inside reports whether path is root or below it. Paths compare without
// case on Windows and macOS, whose file systems usually ignore it.
func inside(path, root string) bool {
	norm := func(p string) string {
		p = strings.TrimRight(filepath.ToSlash(filepath.Clean(p)), "/")
		if runtime.GOOS == "windows" || runtime.GOOS == "darwin" {
			p = strings.ToLower(p)
		}
		return p
	}
	p, r := norm(path), norm(root)
	return r != "" && (p == r || strings.HasPrefix(p, r+"/"))
}

// foldSubagents adds each subagent chat's credits to its parent's total.
func foldSubagents(list []Session) {
	index := map[string]int{}
	for i, x := range list {
		index[x.ID] = i
	}
	for _, x := range list {
		if x.ParentID == "" || x.Credits == nil {
			continue
		}
		if i, ok := index[x.ParentID]; ok && list[i].Credits != nil {
			c := *list[i].Credits + *x.Credits
			list[i].Credits = &c
			list[i].Subagents++
		}
	}
}

func clip(s string) string {
	s = strings.Join(strings.Fields(s), " ")
	if r := []rune(s); len(r) > titleMax {
		return string(r[:titleMax-1]) + "…"
	}
	return s
}

func firstLine(s string) string {
	s, _, _ = strings.Cut(strings.TrimSpace(s), "\n")
	return clip(s)
}
