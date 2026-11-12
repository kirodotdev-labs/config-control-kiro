package sessions

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestRunningV2(t *testing.T) {
	s, dir := setup(t)
	if r := s.Running(); len(r.Running) != 0 {
		t.Errorf("before any listing nothing is known: %v", r.Running)
	}
	s.Overview(false, "")
	if r := s.Running(); strings.Join(r.Running, ",") != "aaaa-1" {
		t.Errorf("no locks: Kiro's answer stands: %v", r.Running)
	}
	lock := func(id string, pid int, started time.Time) {
		_ = os.WriteFile(filepath.Join(dir, id+".lock"), []byte(`{"pid":`+strconv.Itoa(pid)+`,"started_at":"`+started.Format(time.RFC3339Nano)+`"}`), 0o644)
	}
	dead := 1 << 30
	lock("aaaa-1", dead, time.Date(2026, 10, 26, 9, 0, 0, 0, time.UTC))
	if r := s.Running(); len(r.Running) != 0 {
		t.Errorf("a closed terminal stops counting at once: %v", r.Running)
	}
	lock("aaaa-1", os.Getpid(), time.Date(2026, 10, 26, 9, 0, 0, 0, time.UTC))
	lock("dddd-5", os.Getpid(), time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC))
	if r := s.Running(); strings.Join(r.Running, ",") != "aaaa-1" {
		t.Errorf("an old lock with a live pid may be a reused pid: %v", r.Running)
	}
	lock("dddd-5", os.Getpid(), time.Date(2026, 10, 26, 18, 30, 0, 0, time.UTC))
	if r := s.Running(); strings.Join(r.Running, ",") != "aaaa-1,dddd-5" {
		t.Errorf("a chat opened after the listing shows at once: %v", r.Running)
	}
	_ = os.WriteFile(filepath.Join(dir, "dddd-5.lock"), []byte("junk"), 0o644)
	if r := s.Running(); strings.Join(r.Running, ",") != "aaaa-1" {
		t.Errorf("unreadable lock falls back to Kiro: %v", r.Running)
	}
	if processAlive(0) || processAlive(dead) || !processAlive(os.Getpid()) {
		t.Error("processAlive")
	}
}
