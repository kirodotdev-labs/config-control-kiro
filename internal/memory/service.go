// Package memory lists what Kiro CLI V3 remembers across chats, read-only.
//
// Kiro keeps memories in SQLite databases in the Kiro home: one shared store
// at memories/memories.db and one per signed-in account at
// identities/<sha256(account id)>/memories/memories.db. Each memory has a
// type (USER_PREFERENCE or SEMANTIC) and scopes: "Global", or a repository
// tag such as "repo:github/<owner>/<name>". Source: kiro.dev/docs/memory and
// Kiro's agent code.
//
// This package opens the databases read-only and never changes them. Kiro
// edits and deletes memories itself (/memories in a V3 chat).
package memory

import (
	"database/sql"
	"encoding/json"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"

	_ "modernc.org/sqlite" // the database/sql driver, pure Go (no cgo)

	"kiromanager/internal/system"
)

// Global is the scope of a memory Kiro uses in every workspace.
const Global = "Global"

// Memory is one stored memory.
type Memory struct {
	ID         string   `json:"id"`
	Type       string   `json:"type"` // USER_PREFERENCE or SEMANTIC
	Scopes     []string `json:"scopes"`
	Title      string   `json:"title"`
	Summary    string   `json:"summary"`
	Content    string   `json:"content"`
	Why        string   `json:"why,omitempty"`
	HowToApply string   `json:"howToApply,omitempty"`
	CreatedAt  string   `json:"createdAt"`
	UpdatedAt  string   `json:"updatedAt"`
	// Account is true for a memory in a signed-in account's store.
	Account bool `json:"account,omitempty"`
}

// Store is one memory database Kiro has created.
type Store struct {
	Path    string `json:"path"`
	Account bool   `json:"account,omitempty"`
	Error   string `json:"error,omitempty"`
}

// List is the memories for the active scope, newest first.
type List struct {
	Memories []Memory `json:"memories"`
	// Repo is the active Workspace's repository scope, for example
	// "repo:github/owner/name". Empty in Global or when the folder has no
	// remote Kiro recognises.
	Repo string `json:"repo,omitempty"`
	// Elsewhere counts memories for other repositories, left out in a Workspace.
	Elsewhere int     `json:"elsewhere"`
	Stores    []Store `json:"stores"`
}

// Service reads Kiro's memory databases.
type Service struct {
	kiroService *system.KiroService
}

// NewService creates a memory Service.
func NewService(kiroService *system.KiroService) *Service {
	return &Service{kiroService: kiroService}
}

// List returns every memory in Global; in a Workspace, the Global memories
// plus those for its repository.
func (s *Service) List() List {
	out := List{Memories: []Memory{}, Stores: []Store{}}
	if s.kiroService.GetMode() == system.ModeWorkspace {
		out.Repo = repoScope(s.kiroService.GetActiveWorkspace())
	}
	workspace := s.kiroService.GetMode() == system.ModeWorkspace
	for _, st := range stores(s.kiroService.GlobalConfigPath()) {
		memories, err := read(st.Path)
		if err != nil {
			st.Error = "Kiro's memory database couldn't be read: " + err.Error()
		}
		out.Stores = append(out.Stores, st)
		for _, m := range memories {
			m.Account = st.Account
			if workspace && !applies(m.Scopes, out.Repo) {
				out.Elsewhere++
				continue
			}
			out.Memories = append(out.Memories, m)
		}
	}
	sort.SliceStable(out.Memories, func(i, j int) bool { return out.Memories[i].UpdatedAt > out.Memories[j].UpdatedAt })
	return out
}

// applies reports whether a memory is used in a workspace with this repository scope.
func applies(scopes []string, repo string) bool {
	for _, sc := range scopes {
		if sc == Global || (repo != "" && strings.EqualFold(sc, repo)) {
			return true
		}
	}
	return false
}

// stores lists the memory databases that exist: the shared one, then one per account.
func stores(home string) []Store {
	var out []Store
	shared := filepath.Join(home, "memories", "memories.db")
	if fileExists(shared) {
		out = append(out, Store{Path: shared})
	}
	accounts, _ := filepath.Glob(filepath.Join(home, "identities", "*", "memories", "memories.db"))
	sort.Strings(accounts)
	for _, p := range accounts {
		out = append(out, Store{Path: p, Account: true})
	}
	return out
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.Mode().IsRegular()
}

// read opens one database read-only and returns its memories.
func read(path string) ([]Memory, error) {
	db, err := sql.Open("sqlite", readOnlyDSN(path))
	if err != nil {
		return nil, err
	}
	defer db.Close()
	rows, err := db.Query(`SELECT id, memory_type, scopes, title, summary, content,
		COALESCE(why, ''), COALESCE(how_to_apply, ''), created_at, updated_at FROM memories`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Memory
	for rows.Next() {
		var m Memory
		var scopes string
		if err := rows.Scan(&m.ID, &m.Type, &scopes, &m.Title, &m.Summary, &m.Content, &m.Why, &m.HowToApply, &m.CreatedAt, &m.UpdatedAt); err != nil {
			return nil, err
		}
		if json.Unmarshal([]byte(scopes), &m.Scopes) != nil || m.Scopes == nil {
			m.Scopes = []string{}
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// readOnlyDSN is a SQLite URI that opens path read-only and waits briefly
// while Kiro is writing. It works for Windows drive paths too.
func readOnlyDSN(path string) string {
	p := filepath.ToSlash(path)
	if !strings.HasPrefix(p, "/") {
		p = "/" + p // C:/Users/... → /C:/Users/...
	}
	u := url.URL{Scheme: "file", Path: p, RawQuery: "mode=ro&_pragma=busy_timeout(2000)"}
	return u.String()
}
