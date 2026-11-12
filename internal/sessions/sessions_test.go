package sessions

import (
	"context"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"kiromanager/internal/kirocli"
)

func setup(t *testing.T) (*Service, string) {
	home := t.TempDir()
	dir := writeV2Store(t, home)
	writeV3Store(t, home)
	s := NewService(fakeRunner(listJSON, false), func() string { return home }, rates)
	s.now = func() time.Time { return time.Date(2026, 10, 26, 18, 0, 0, 0, time.UTC) }
	return s, dir
}

func TestOverview(t *testing.T) {
	s, _ := setup(t)
	ov := s.Overview(false, "")
	if ov.Problem != nil || len(ov.Sessions) != 9 {
		t.Fatalf("%+v", ov)
	}
	first := ov.Sessions[0]
	if first.ID != "aaaa-1" || first.Title != "fix the login bug" || !first.Running || first.Folder != "/work/app" || first.Agent != "reviewer" {
		t.Errorf("first: %+v", first)
	}
	if *first.Credits != 8 || first.Subagents != 1 || *first.ContextPct != 85 || first.MaxContext != 90 || first.Rate != 2 {
		t.Errorf("credits fold subagents in and context is read: %+v %v", first, *first.Credits)
	}
	if first.Resume != "kiro-cli chat --v2 --resume-id aaaa-1" {
		t.Errorf("resume %q", first.Resume)
	}
	byID := map[string]Session{}
	for _, x := range ov.Sessions {
		byID[x.ID] = x
	}
	if v3 := byID["sess_bbbb3"]; v3.Engine != "v3" || v3.Credits == nil || *v3.Credits != 2 || v3.Subagents != 1 || v3.Agent != "reviewer" ||
		v3.Rate != 2 || *v3.ContextPct != 40 || v3.Folder != "/work/app" || v3.Resume != "kiro-cli chat --v3 --resume-id sess_bbbb3" {
		t.Errorf("V3 chats come from Kiro's V3 store, with credits, context and a --v3 resume: %+v", v3)
	}
	if c := byID["cccc-4"]; c.Resume != "kiro-cli chat --legacy-ui --resume-id cccc-4" {
		t.Errorf("classic: %q", c.Resume)
	}

	u := ov.Usage
	if u.Today != 4.5 || u.Week != 11.5 || u.Month != 11.5 || u.Covered != 7 || u.Total != 9 {
		t.Errorf("totals: today %v week %v month %v covered %d", u.Today, u.Week, u.Month, u.Covered)
	}
	if len(u.Daily) != 30 || u.Daily[29].Date != "2026-10-26" || u.Daily[29].Credits != 4.5 {
		t.Errorf("daily: %+v", u.Daily[29])
	}
	if len(u.ByAgent) != 2 || u.ByAgent[0].Name != "reviewer" || u.ByAgent[0].Credits != 10 || u.ByAgent[0].FullChats != 1 ||
		u.ByAgent[0].RunningNow != 1 || u.ByAgent[0].MainRate != 2 || u.ByAgent[1].Name != "kiro_default" {
		t.Errorf("by agent: %+v", u.ByAgent)
	}
	if len(u.Top) != 3 || u.Top[0].ID != "aaaa-1" || u.Top[0].Credits != 8 || u.Top[1].ID != "sess_bbbb3" {
		t.Errorf("top chats fold subagents into the parent: %+v", u.Top)
	}
	if len(u.ByFolder) != 2 || u.ByFolder[0].Name != "/work/app" {
		t.Errorf("by folder: %+v", u.ByFolder)
	}
}

func TestOverviewNeverExposesText(t *testing.T) {
	s, _ := setup(t)
	ov := s.Overview(false, "")
	for _, x := range ov.Sessions {
		if strings.Contains(x.Title, "secret") {
			t.Fatal("the title comes from kiro-cli's list, never from the chat file")
		}
	}
}

func TestCacheAndChanges(t *testing.T) {
	s, dir := setup(t)
	calls := 0
	exec := s.runner.Exec
	s.runner.Exec = func(ctx context.Context, b string, a ...string) (kirocli.Result, error) {
		calls++
		return exec(ctx, b, a...)
	}
	s.Overview(false, "")
	s.Overview(false, "")
	if calls != 1 {
		t.Errorf("listing is cached, ran %d times", calls)
	}
	_ = os.WriteFile(filepath.Join(dir, "dddd-5.json"), []byte(file("", "m", 1, 5, "", turn("2026-10-26T12:00:00Z", 5, "3"))), 0o644)
	future := time.Now().Add(time.Minute)
	_ = os.Chtimes(filepath.Join(dir, "dddd-5.json"), future, future)
	if ov := s.Overview(true, ""); ov.Usage.Today != 7.5 || calls != 2 {
		t.Errorf("refresh re-reads changed files: today %v calls %d", ov.Usage.Today, calls)
	}
	_ = os.WriteFile(filepath.Join(dir, "dddd-5.json"), []byte(`{"half`), 0o644)
	if ov := s.Overview(true, ""); ov.Usage.Covered != 6 {
		t.Errorf("a half-written file is skipped: %d", ov.Usage.Covered)
	}
}

func TestProblems(t *testing.T) {
	home := t.TempDir()
	s := NewService(fakeRunner("", true), func() string { return home }, rates)
	ov := s.Overview(false, "")
	if ov.Problem == nil || ov.Problem.Code != kirocli.Unsupported || ov.Sessions == nil || len(ov.Usage.Daily) != 30 {
		t.Errorf("an old kiro-cli reports Unsupported with empty lists: %+v", ov.Problem)
	}
	s = NewService(fakeRunner("not json", false), func() string { return home }, rates)
	if ov := s.Overview(false, ""); ov.Problem == nil || ov.Problem.Code != kirocli.Failed {
		t.Errorf("unreadable output: %+v", ov.Problem)
	}
	s = NewService(fakeRunner("[]", false), func() string { return home }, rates)
	if ov := s.Overview(false, ""); ov.Problem != nil || len(ov.Sessions) != 0 {
		t.Errorf("no chats: %+v", ov)
	}
}

func TestValidID(t *testing.T) {
	for _, bad := range []string{"", "../x", "a b", "a;rm", strings.Repeat("a", 101)} {
		if validID(bad) || resumeCommand("v2", bad) != "" {
			t.Errorf("%q accepted", bad)
		}
	}
	if !validID("5283534f-9057-4004-b4d6-6cc379409dfe") {
		t.Error("uuid rejected")
	}
}

func TestFolderFilter(t *testing.T) {
	s, _ := setup(t)
	ov := s.Overview(false, "/work/app/")
	if len(ov.Sessions) != 4 || ov.Usage.Total != 4 || ov.Usage.Month != 10 {
		t.Errorf("folder filter: %d chats, %v credits", len(ov.Sessions), ov.Usage.Month)
	}
	if !inside("/work/app/sub", "/work/app") || inside("/work/apple", "/work/app") || inside("/x", "") {
		t.Error("inside")
	}
}

func TestTags(t *testing.T) {
	s, _ := setup(t)
	got, err := s.SetTags("aaaa-1", []string{"#Client X", "client-x", " urgent ", "", "a/b"})
	if err != nil || strings.Join(got, ",") != "ab,client-x,urgent" {
		t.Fatalf("set: %v %v", got, err)
	}
	_, _ = s.SetTags("dddd-5", []string{"urgent"})
	byID := func() map[string]Session {
		m := map[string]Session{}
		for _, x := range s.Overview(false, "").Sessions {
			m[x.ID] = x
		}
		return m
	}
	if m := byID(); strings.Join(m["aaaa-1"].Tags, ",") != "ab,client-x,urgent" || len(m["sess_bbbb3"].Tags) != 0 {
		t.Errorf("overview carries tags: %v", m["aaaa-1"].Tags)
	}
	if err := s.RenameTag("urgent", "Later"); err != nil {
		t.Fatal(err)
	}
	if m := byID(); strings.Join(m["dddd-5"].Tags, ",") != "later" {
		t.Errorf("rename: %v", m["dddd-5"].Tags)
	}
	_ = s.RenameTag("later", "")
	if m := byID(); len(m["dddd-5"].Tags) != 0 || strings.Join(m["aaaa-1"].Tags, ",") != "ab,client-x" {
		t.Errorf("delete tag: %v %v", m["dddd-5"].Tags, m["aaaa-1"].Tags)
	}
	data, _ := os.ReadFile(s.tags.path())
	if !strings.Contains(string(data), `"version": 1`) || strings.Contains(string(data), "dddd-5") {
		t.Errorf("file: %s", data)
	}
	if !strings.HasSuffix(filepath.ToSlash(s.tags.path()), "kiroui/chat-tags.json") {
		t.Errorf("path %s", s.tags.path())
	}
	many := make([]string, 21)
	for i := range many {
		many[i] = strconv.Itoa(i)
	}
	if _, err := s.SetTags("aaaa-1", many); err == nil {
		t.Error("more than 20 tags is rejected")
	}
	if _, err := s.SetTags("../x", []string{"a"}); err == nil {
		t.Error("bad id rejected")
	}
	_ = os.WriteFile(s.tags.path(), []byte("{broken"), 0o644)
	if m := byID(); len(m["aaaa-1"].Tags) != 0 {
		t.Error("a broken tags file reads as no tags")
	}
}
