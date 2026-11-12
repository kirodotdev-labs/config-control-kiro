package memory

import (
	"crypto/md5"
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

// kiroSchema is the memories table as Kiro creates it (Kiro CLI 2.34).
const kiroSchema = `CREATE TABLE memories (
	id TEXT NOT NULL PRIMARY KEY, memory_type TEXT NOT NULL, scopes TEXT NOT NULL,
	title TEXT NOT NULL, summary TEXT NOT NULL, content TEXT NOT NULL, why TEXT,
	how_to_apply TEXT, session_id TEXT NOT NULL, metadata TEXT, created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL, cloud_state TEXT NOT NULL DEFAULT 'pending',
	rev_number INTEGER NOT NULL DEFAULT 1)`

// writeStore creates a Kiro memory database at path with the given rows
// (id, type, scopes JSON, title, updated_at).
func writeStore(t *testing.T, path string, rows ...[5]string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(kiroSchema); err != nil {
		t.Fatal(err)
	}
	for _, r := range rows {
		if _, err := db.Exec(`INSERT INTO memories (id, memory_type, scopes, title, summary, content, why, session_id, created_at, updated_at)
			VALUES (?, ?, ?, ?, 'one line', 'the content', 'because', 'sess', '2026-11-01T00:00:00Z', ?)`, r[0], r[1], r[2], r[3], r[4]); err != nil {
			t.Fatal(err)
		}
	}
}

func newTestService(t *testing.T) (*Service, string) {
	t.Helper()
	home := t.TempDir()
	t.Setenv("KIRO_HOME", home)
	return NewService(system.NewKiroService(utils.NewLogger(), "test")), home
}

func sum(t *testing.T, path string) [16]byte {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return md5.Sum(data)
}

func TestNoStoresIsEmpty(t *testing.T) {
	svc, _ := newTestService(t)
	if l := svc.List(); len(l.Memories) != 0 || len(l.Stores) != 0 || l.Memories == nil {
		t.Fatalf("%+v", l)
	}
}

func TestListGlobalAndWorkspace(t *testing.T) {
	svc, home := newTestService(t)
	shared := filepath.Join(home, "memories", "memories.db")
	writeStore(t, shared,
		[5]string{"a", "USER_PREFERENCE", `["Global"]`, "Conventional Commits", "2026-11-02T00:00:00Z"},
		[5]string{"b", "SEMANTIC", `["repo:github/acme/shop"]`, "Seed the database first", "2026-11-05T00:00:00Z"},
		[5]string{"c", "SEMANTIC", `["repo:github/acme/other"]`, "Other repo", "2026-11-04T00:00:00Z"},
		[5]string{"d", "SEMANTIC", `not json`, "Broken scopes", "2026-11-01T00:00:00Z"})
	writeStore(t, filepath.Join(home, "identities", "abc", "memories", "memories.db"),
		[5]string{"e", "USER_PREFERENCE", `["Global"]`, "From my account", "2026-11-03T00:00:00Z"})
	before := sum(t, shared)

	l := svc.List()
	if len(l.Memories) != 5 || l.Memories[0].ID != "b" || l.Memories[1].ID != "c" || l.Repo != "" || len(l.Stores) != 2 {
		t.Fatalf("Global lists everything, newest first: %+v", l)
	}
	if m := l.Memories[2]; m.ID != "e" || !m.Account || m.Why != "because" {
		t.Errorf("account memory: %+v", m)
	}
	if m := l.Memories[4]; m.ID != "d" || len(m.Scopes) != 0 {
		t.Errorf("bad scopes read as none: %+v", m)
	}

	proj := t.TempDir()
	_ = os.MkdirAll(filepath.Join(proj, ".git"), 0o755)
	_ = os.WriteFile(filepath.Join(proj, ".git", "config"), []byte("[core]\n\tbare = false\n[remote \"origin\"]\n\turl = git@github.com:acme/shop.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n"), 0o644)
	if err := svc.kiroService.SetWorkspace(proj); err != nil {
		t.Fatal(err)
	}
	l = svc.List()
	if l.Repo != "repo:github/acme/shop" || len(l.Memories) != 3 || l.Elsewhere != 2 {
		t.Fatalf("Workspace: Global plus this repository: %+v", l)
	}
	if sum(t, shared) != before {
		t.Error("the database must not change")
	}
}

func TestUnreadableStoreIsReported(t *testing.T) {
	svc, home := newTestService(t)
	path := filepath.Join(home, "memories", "memories.db")
	_ = os.MkdirAll(filepath.Dir(path), 0o700)
	_ = os.WriteFile(path, []byte("not a database"), 0o600)
	l := svc.List()
	if len(l.Stores) != 1 || l.Stores[0].Error == "" || len(l.Memories) != 0 {
		t.Fatalf("%+v", l)
	}
	if data, _ := os.ReadFile(path); string(data) != "not a database" {
		t.Error("the file must not change")
	}
}

func TestRepoScope(t *testing.T) {
	cases := map[string]string{
		"https://github.com/acme/shop.git":           "repo:github/acme/shop",
		"git@github.com:acme/shop":                   "repo:github/acme/shop",
		"ssh://git@github.com:22/acme/shop.git":      "repo:github/acme/shop",
		"https://gitlab.com/group/sub/proj.git":      "repo:gitlab/group/sub/proj",
		"git@bitbucket.org:team/repo.git":            "repo:bitbucket/team/repo",
		"ssh://git.amazon.com:2222/pkg/MyPackage":    "repo:gitfarm/gitfarm/MyPackage",
		"https://us-east.git.amazon.com/x/MyPackage": "repo:gitfarm/gitfarm/MyPackage",
		"https://example.com/acme/shop.git":          "",
		"https://github.com/onlyowner":               "",
		"":                                           "",
	}
	for remote, want := range cases {
		dir := t.TempDir()
		if remote != "" {
			_ = os.MkdirAll(filepath.Join(dir, ".git"), 0o755)
			_ = os.WriteFile(filepath.Join(dir, ".git", "config"), []byte("[remote \"upstream\"]\n\turl = https://github.com/no/no\n[remote \"origin\"]\n\turl = "+remote+"\n"), 0o644)
		}
		if got := repoScope(dir); got != want {
			t.Errorf("%q: got %q, want %q", remote, got, want)
		}
	}
}

func TestReadOnlyDSN(t *testing.T) {
	for path, want := range map[string]string{
		"/home/me/.kiro/memories/memories.db": "file:///home/me/.kiro/memories/memories.db?mode=ro&_pragma=busy_timeout(2000)",
		"/tmp/a b#c/memories.db":              "file:///tmp/a%20b%23c/memories.db?mode=ro&_pragma=busy_timeout(2000)",
	} {
		if got := readOnlyDSN(path); got != want {
			t.Errorf("%s: %s", path, got)
		}
	}
}
