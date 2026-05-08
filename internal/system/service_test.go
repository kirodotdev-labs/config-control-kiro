package system

import (
	"os"
	"path/filepath"
	"testing"

	"kiromanager/internal/shared/utils"
)

func newTestService(t *testing.T) *KiroService {
	t.Helper()
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
	home, _ := os.UserHomeDir()
	expected := filepath.Join(home, ".kiro")
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

func TestGetKiroStatus(t *testing.T) {
	svc := newTestService(t)
	status, err := svc.GetKiroStatus()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, ok := status["installed"]; !ok {
		t.Error("expected 'installed' key in status")
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
	svc := newTestService(t)
	dir := t.TempDir()

	if err := svc.InitWorkspace(dir); err != nil {
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

func TestGetKiroModels(t *testing.T) {
	svc := newTestService(t)
	models, err := svc.GetKiroModels()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(models) != 1 || models[0] != "auto" {
		t.Errorf("expected [auto], got %v", models)
	}
}

func TestListWorkspacesWithStats(t *testing.T) {
	svc := newTestService(t)
	dir := t.TempDir()
	svc.AddWorkspace(dir)

	os.WriteFile(filepath.Join(dir, ".kiro", "steering", "test.md"), []byte("# test"), 0644)

	list := svc.ListWorkspacesWithStats()
	var found *WorkspaceInfo
	for i := range list {
		if list[i].Path == dir {
			found = &list[i]
			break
		}
	}
	if found == nil {
		t.Fatal("workspace not found in list")
	}
	if found.Steering < 1 {
		t.Errorf("expected at least 1 steering, got %d", found.Steering)
	}
	if !found.Exists {
		t.Error("expected .kiro to exist")
	}
}

func TestDeleteWorkspace(t *testing.T) {
	svc := newTestService(t)
	dir := t.TempDir()
	svc.AddWorkspace(dir)

	if err := svc.DeleteWorkspace(dir); err != nil {
		t.Fatalf("delete failed: %v", err)
	}

	// .kiro should be gone
	if _, err := os.Stat(filepath.Join(dir, ".kiro")); !os.IsNotExist(err) {
		t.Error("expected .kiro to be deleted")
	}

	// Should be removed from list
	for _, w := range svc.GetWorkspaces() {
		if w.Path == dir {
			t.Error("expected workspace removed from list")
		}
	}
}

func TestCopyWorkspace(t *testing.T) {
	svc := newTestService(t)
	src := t.TempDir()
	dest := t.TempDir()
	svc.AddWorkspace(src)

	// Add a test file
	os.WriteFile(filepath.Join(src, ".kiro", "steering", "test.md"), []byte("# copied"), 0644)

	if err := svc.CopyWorkspace(src, dest); err != nil {
		t.Fatalf("copy failed: %v", err)
	}

	// Check dest has the file
	content, err := os.ReadFile(filepath.Join(dest, ".kiro", "steering", "test.md"))
	if err != nil {
		t.Fatalf("copied file not found: %v", err)
	}
	if string(content) != "# copied" {
		t.Errorf("expected '# copied', got '%s'", string(content))
	}

	// Source should still exist
	if _, err := os.Stat(filepath.Join(src, ".kiro")); err != nil {
		t.Error("source should still exist after copy")
	}
}

func TestMoveWorkspace(t *testing.T) {
	svc := newTestService(t)
	src := t.TempDir()
	dest := t.TempDir()
	svc.AddWorkspace(src)

	os.WriteFile(filepath.Join(src, ".kiro", "steering", "test.md"), []byte("# moved"), 0644)

	if err := svc.MoveWorkspace(src, dest); err != nil {
		t.Fatalf("move failed: %v", err)
	}

	// Source .kiro should be gone
	if _, err := os.Stat(filepath.Join(src, ".kiro")); !os.IsNotExist(err) {
		t.Error("source .kiro should be removed after move")
	}

	// Dest should have the file
	content, err := os.ReadFile(filepath.Join(dest, ".kiro", "steering", "test.md"))
	if err != nil {
		t.Fatalf("moved file not found: %v", err)
	}
	if string(content) != "# moved" {
		t.Errorf("expected '# moved', got '%s'", string(content))
	}

	// Workspace list should have dest, not src
	for _, w := range svc.GetWorkspaces() {
		if w.Path == src {
			t.Error("source should be removed from list")
		}
	}
	found := false
	for _, w := range svc.GetWorkspaces() {
		if w.Path == dest {
			found = true
		}
	}
	if !found {
		t.Error("dest should be in workspace list")
	}
}
