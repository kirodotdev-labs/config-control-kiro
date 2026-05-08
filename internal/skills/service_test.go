package skills

import (
	"os"
	"path/filepath"
	"testing"

	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

func setupTestService(t *testing.T) (*Service, string) {
	t.Helper()
	dir := t.TempDir()
	logger := utils.NewLogger()
	kiroSvc := system.NewKiroService(logger, "test")
	kiroSvc.SetWorkspace(dir)
	os.MkdirAll(filepath.Join(dir, ".kiro", "skills"), 0755)
	return NewService(kiroSvc, logger), dir
}

func TestDeactivate_Empty(t *testing.T) {
	svc, _ := setupTestService(t)
	if err := svc.Deactivate(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestDeactivate_RemovesAll(t *testing.T) {
	svc, dir := setupTestService(t)
	skillsPath := filepath.Join(dir, ".kiro", "skills")

	// Create some skill folders
	os.MkdirAll(filepath.Join(skillsPath, "skill-a"), 0755)
	os.WriteFile(filepath.Join(skillsPath, "skill-a", "SKILL.md"), []byte("# A"), 0644)
	os.MkdirAll(filepath.Join(skillsPath, "skill-b"), 0755)

	if err := svc.Deactivate(); err != nil {
		t.Fatalf("deactivate failed: %v", err)
	}

	entries, _ := os.ReadDir(skillsPath)
	if len(entries) != 0 {
		t.Errorf("expected 0 entries after deactivate, got %d", len(entries))
	}
}
