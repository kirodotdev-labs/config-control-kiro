package system

import (
	"fmt"
	"os"
	"path/filepath"
)

// GetMode returns the active scope mode.
func (s *KiroService) GetMode() WorkspaceMode { return s.snapshot().mode }

// GetActiveWorkspace returns the active workspace root ("" in global mode).
func (s *KiroService) GetActiveWorkspace() string { return s.snapshot().activeWorkspace }

// SetWorkspace switches to the workspace at projectPath ("" means global).
func (s *KiroService) SetWorkspace(projectPath string) error {
	if projectPath == "" {
		return s.SetGlobal()
	}
	if info, err := os.Stat(projectPath); err != nil || !info.IsDir() {
		return fmt.Errorf("workspace path does not exist: %s", projectPath)
	}
	s.mu.Lock()
	s.mode, s.activeWorkspace = ModeWorkspace, projectPath
	s.configPath = filepath.Join(projectPath, ".kiro")
	s.mu.Unlock()
	s.logger.Info("Switched to workspace: %s", projectPath)
	return nil
}

// SetGlobal switches back to the global scope.
func (s *KiroService) SetGlobal() error {
	s.mu.Lock()
	s.mode, s.activeWorkspace, s.configPath = ModeGlobal, "", s.globalConfigPath
	s.mu.Unlock()
	s.logger.Info("Switched to global mode")
	return nil
}

// GetWorkspaces returns the saved workspace list.
func (s *KiroService) GetWorkspaces() []WorkspaceEntry {
	var workspaces []WorkspaceEntry
	_ = s.ReadJSONFile(s.workspacesFile, &workspaces)
	return workspaces
}

// WorkspaceStatus is a saved workspace plus whether its folder still exists,
// so the UI can flag workspaces that were moved or deleted.
type WorkspaceStatus struct {
	WorkspaceEntry
	Exists bool `json:"exists"`
}

// WorkspaceStatuses returns the saved workspaces with an existence check.
func (s *KiroService) WorkspaceStatuses() []WorkspaceStatus {
	out := []WorkspaceStatus{}
	for _, w := range s.GetWorkspaces() {
		info, err := os.Stat(w.Path)
		out = append(out, WorkspaceStatus{WorkspaceEntry: w, Exists: err == nil && info.IsDir()})
	}
	return out
}

// AddWorkspace creates the .kiro skeleton in projectPath (adopting an existing
// one) and saves it to the workspace list.
func (s *KiroService) AddWorkspace(projectPath string) error {
	if err := initWorkspace(projectPath); err != nil {
		return err
	}
	workspaces := s.GetWorkspaces()
	for _, w := range workspaces {
		if w.Path == projectPath {
			return nil
		}
	}
	workspaces = append(workspaces, WorkspaceEntry{Path: projectPath, Name: filepath.Base(projectPath)})
	s.logger.Info("Added workspace %s", projectPath)
	return s.WriteJSONFile(s.workspacesFile, workspaces)
}

// RemoveWorkspace forgets a workspace. Files on disk are never deleted.
func (s *KiroService) RemoveWorkspace(projectPath string) error {
	filtered := make([]WorkspaceEntry, 0)
	for _, w := range s.GetWorkspaces() {
		if w.Path != projectPath {
			filtered = append(filtered, w)
		}
	}
	if s.GetActiveWorkspace() == projectPath {
		_ = s.SetGlobal()
	}
	return s.WriteJSONFile(s.workspacesFile, filtered)
}

// initWorkspace creates the standard .kiro directories under projectPath.
func initWorkspace(projectPath string) error {
	for _, sub := range []string{"agents", "settings", "steering", "skills"} {
		dir := filepath.Join(projectPath, ".kiro", sub)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("create %s: %w", dir, err)
		}
	}
	return nil
}
