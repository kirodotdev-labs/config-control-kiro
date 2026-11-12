package system

import (
	"os"
	"path/filepath"
	"testing"

	"kiromanager/internal/shared/utils"
)

// newTestService returns a service whose global Kiro home is a temp dir, so
// tests never read or write the developer's real ~/.kiro.
func newTestService(t *testing.T) *KiroService {
	t.Helper()
	t.Setenv("KIRO_HOME", t.TempDir())
	return NewKiroService(utils.NewLogger(), "test")
}

func TestNewKiroService_Defaults(t *testing.T) {
	svc := newTestService(t)
	if svc.GetMode() != ModeGlobal {
		t.Errorf("expected global mode, got %v", svc.GetMode())
	}
	if svc.GetActiveWorkspace() != "" {
		t.Errorf("expected empty workspace, got %q", svc.GetActiveWorkspace())
	}
	expected := os.Getenv("KIRO_HOME")
	if svc.GetConfigPath() != expected {
		t.Errorf("expected %q, got %q", expected, svc.GetConfigPath())
	}
}

func TestSetWorkspace(t *testing.T) {
	svc := newTestService(t)
	dir := t.TempDir()

	if err := svc.SetWorkspace(dir); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if svc.GetMode() != ModeWorkspace {
		t.Errorf("expected workspace mode")
	}
	if svc.GetActiveWorkspace() != dir {
		t.Errorf("expected %q, got %q", dir, svc.GetActiveWorkspace())
	}
	expected := filepath.Join(dir, ".kiro")
	if svc.GetConfigPath() != expected {
		t.Errorf("expected %q, got %q", expected, svc.GetConfigPath())
	}
}

func TestSetWorkspace_InvalidPath(t *testing.T) {
	svc := newTestService(t)
	err := svc.SetWorkspace("/nonexistent/path/xyz")
	if err == nil {
		t.Error("expected error for nonexistent path")
	}
}

func TestSetGlobal(t *testing.T) {
	svc := newTestService(t)
	dir := t.TempDir()
	svc.SetWorkspace(dir)
	svc.SetGlobal()

	if svc.GetMode() != ModeGlobal {
		t.Errorf("expected global mode")
	}
	if svc.GetActiveWorkspace() != "" {
		t.Errorf("expected empty workspace")
	}
}

func TestSetWorkspace_EmptyPath(t *testing.T) {
	svc := newTestService(t)
	dir := t.TempDir()
	svc.SetWorkspace(dir)
	svc.SetWorkspace("") // should switch to global
	if svc.GetMode() != ModeGlobal {
		t.Errorf("expected global mode for empty path")
	}
}

func TestGetSystemInfo(t *testing.T) {
	svc := newTestService(t)
	info, err := svc.GetSystemInfo()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if info.Platform == "" {
		t.Error("expected non-empty platform")
	}
	if info.Arch == "" {
		t.Error("expected non-empty arch")
	}
}

func TestReadWriteJSONFile(t *testing.T) {
	svc := newTestService(t)
	dir := t.TempDir()
	path := filepath.Join(dir, "test.json")

	data := map[string]string{"key": "value"}
	if err := svc.WriteJSONFile(path, data); err != nil {
		t.Fatalf("write failed: %v", err)
	}

	var result map[string]string
	if err := svc.ReadJSONFile(path, &result); err != nil {
		t.Fatalf("read failed: %v", err)
	}
	if result["key"] != "value" {
		t.Errorf("expected 'value', got %q", result["key"])
	}
}

func TestInitWorkspace(t *testing.T) {
	dir := t.TempDir()

	if err := initWorkspace(dir); err != nil {
		t.Fatalf("init failed: %v", err)
	}

	dirs := []string{"agents", "settings", "steering", "skills"}
	for _, d := range dirs {
		path := filepath.Join(dir, ".kiro", d)
		if _, err := os.Stat(path); os.IsNotExist(err) {
			t.Errorf("expected directory %q to exist", path)
		}
	}
}

func TestAddAndRemoveWorkspace(t *testing.T) {
	svc := newTestService(t)
	dir := t.TempDir()

	if err := svc.AddWorkspace(dir); err != nil {
		t.Fatalf("add failed: %v", err)
	}

	workspaces := svc.GetWorkspaces()
	found := false
	for _, w := range workspaces {
		if w.Path == dir {
			found = true
		}
	}
	if !found {
		t.Error("expected workspace in list")
	}

	if err := svc.RemoveWorkspace(dir); err != nil {
		t.Fatalf("remove failed: %v", err)
	}
}

func TestWorkspaceStatuses(t *testing.T) {
	svc := newTestService(t)
	live, gone := t.TempDir(), t.TempDir()
	for _, p := range []string{live, gone} {
		if err := svc.AddWorkspace(p); err != nil {
			t.Fatal(err)
		}
	}
	_ = os.RemoveAll(gone)
	got := svc.WorkspaceStatuses()
	if len(got) != 2 || !got[0].Exists || got[1].Exists {
		t.Errorf("statuses %+v", got)
	}
}

func TestScopeSwitching(t *testing.T) {
	svc := newTestService(t)
	dir := t.TempDir()
	if err := svc.SetWorkspace(dir); err != nil {
		t.Fatalf("SetWorkspace: %v", err)
	}
	if svc.GetMode() != ModeWorkspace || svc.GetActiveWorkspace() != dir {
		t.Fatalf("mode=%s active=%s", svc.GetMode(), svc.GetActiveWorkspace())
	}
	if got := svc.GetConfigPath(); got != filepath.Join(dir, ".kiro") {
		t.Errorf("config path %q", got)
	}
	if err := svc.SetWorkspace(filepath.Join(dir, "missing")); err == nil {
		t.Error("missing workspace dir should error")
	}
	if err := svc.SetGlobal(); err != nil || svc.GetMode() != ModeGlobal {
		t.Errorf("SetGlobal: err=%v mode=%s", err, svc.GetMode())
	}
}

func TestScopeConcurrentAccess(t *testing.T) {
	svc := newTestService(t)
	dir := t.TempDir()
	done := make(chan struct{})
	go func() {
		for i := 0; i < 200; i++ {
			_ = svc.SetWorkspace(dir)
			_ = svc.SetGlobal()
		}
		close(done)
	}()
	for i := 0; i < 200; i++ {
		_ = svc.PermissionsPath()
		_ = svc.AgentsDir()
	}
	<-done
}
