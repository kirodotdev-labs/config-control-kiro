// Package system provides core system services for the Kiro manager,
// including workspace management, system info, and configuration handling.
package system

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"kiromanager/internal/models"
	"kiromanager/internal/shared/utils"
)

// WorkspaceMode represents the active configuration scope
type WorkspaceMode string

const (
	// ModeGlobal indicates the global ~/.kiro configuration scope.
	ModeGlobal WorkspaceMode = "global"
	// ModeWorkspace indicates a project-specific .kiro configuration scope.
	ModeWorkspace WorkspaceMode = "workspace"
)

// WorkspaceEntry represents a saved workspace
type WorkspaceEntry struct {
	Path string `json:"path"`
	Name string `json:"name"`
}

// KiroService manages Kiro CLI configuration, workspace switching,
// and system-level operations such as detecting the runtime environment.
type KiroService struct {
	logger            *utils.Logger
	configPath        string // active .kiro path (global or workspace)
	globalConfigPath  string // always ~/.kiro
	homeDir           string
	isWSL             bool
	appVersion        string
	mode              WorkspaceMode
	activeWorkspace   string // project root path when in workspace mode
	workspacesFile    string // ~/.kiro/kiroui/workspaces.json
}

// NewKiroService creates a KiroService initialised with the user's home
// directory, global config path, and WSL detection.
func NewKiroService(logger *utils.Logger, appVersion string) *KiroService {
	homeDir, _ := os.UserHomeDir()
	configPath := filepath.Join(homeDir, ".kiro")

	isWSL := false
	if runtime.GOOS == "linux" {
		if data, err := os.ReadFile("/proc/version"); err == nil {
			content := strings.ToLower(string(data))
			isWSL = strings.Contains(content, "microsoft") || strings.Contains(content, "wsl")
		}
	}

	return &KiroService{
		logger:           logger,
		configPath:       configPath,
		globalConfigPath: configPath,
		homeDir:          homeDir,
		isWSL:            isWSL,
		appVersion:       appVersion,
		mode:             ModeGlobal,
		workspacesFile:   filepath.Join(configPath, "kiroui", "workspaces.json"),
	}
}

// GetConfigPath returns the active .kiro path
func (s *KiroService) GetConfigPath() string {
	return s.configPath
}

// GetGlobalConfigPath always returns ~/.kiro
func (s *KiroService) GetGlobalConfigPath() string {
	return s.globalConfigPath
}

// GetHomeDir returns the user's home directory (cross-platform)
func (s *KiroService) GetHomeDir() string {
	return s.homeDir
}

// IsWSL returns whether running in Windows Subsystem for Linux
func (s *KiroService) IsWSL() bool {
	return s.isWSL
}

// GetMode returns the current workspace mode
func (s *KiroService) GetMode() WorkspaceMode {
	return s.mode
}

// GetActiveWorkspace returns the workspace root path (empty if global)
func (s *KiroService) GetActiveWorkspace() string {
	return s.activeWorkspace
}

// SetWorkspace switches to workspace mode for the given project path
func (s *KiroService) SetWorkspace(projectPath string) error {
	if projectPath == "" {
		return s.SetGlobal()
	}
	// Validate path exists
	if _, err := os.Stat(projectPath); err != nil {
		return fmt.Errorf("workspace path does not exist: %s", projectPath)
	}
	s.mode = ModeWorkspace
	s.activeWorkspace = projectPath
	s.configPath = filepath.Join(projectPath, ".kiro")
	s.logger.Info("Switched to workspace: %s", projectPath)
	return nil
}

// SetGlobal switches back to global mode
func (s *KiroService) SetGlobal() error {
	s.mode = ModeGlobal
	s.activeWorkspace = ""
	s.configPath = s.globalConfigPath
	s.logger.Info("Switched to global mode")
	return nil
}

// InitWorkspace creates .kiro structure in a project directory
func (s *KiroService) InitWorkspace(projectPath string) error {
	kiroDirs := []string{
		filepath.Join(projectPath, ".kiro", "agents"),
		filepath.Join(projectPath, ".kiro", "settings"),
		filepath.Join(projectPath, ".kiro", "steering"),
		filepath.Join(projectPath, ".kiro", "skills"),
	}
	for _, dir := range kiroDirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("failed to create %s: %v", dir, err)
		}
	}
	s.logger.Info("Initialized workspace at %s", projectPath)
	return nil
}

// GetWorkspaces returns saved workspace list
func (s *KiroService) GetWorkspaces() []WorkspaceEntry {
	var workspaces []WorkspaceEntry
	s.ReadJSONFile(s.workspacesFile, &workspaces)
	return workspaces
}

// AddWorkspace saves a workspace and initializes it
func (s *KiroService) AddWorkspace(projectPath string) error {
	if err := s.InitWorkspace(projectPath); err != nil {
		return err
	}
	return s.addToList(projectPath)
}

// AddExistingWorkspace adds a workspace only if .kiro already exists.
func (s *KiroService) AddExistingWorkspace(projectPath string) error {
	kiroPath := filepath.Join(projectPath, ".kiro")
	if !s.dirExists(kiroPath) {
		return fmt.Errorf("no .kiro workspace found at %s — use Create New instead", projectPath)
	}
	return s.addToList(projectPath)
}

// addToList adds a project path to the workspace list if not already present.
func (s *KiroService) addToList(projectPath string) error {
	workspaces := s.GetWorkspaces()
	// Check for duplicate
	for _, w := range workspaces {
		if w.Path == projectPath {
			return nil
		}
	}
	name := filepath.Base(projectPath)
	workspaces = append(workspaces, WorkspaceEntry{Path: projectPath, Name: name})
	return s.WriteJSONFile(s.workspacesFile, workspaces)
}

// RemoveWorkspace removes a workspace from the saved list (does not delete files)
func (s *KiroService) RemoveWorkspace(projectPath string) error {
	workspaces := s.GetWorkspaces()
	filtered := make([]WorkspaceEntry, 0)
	for _, w := range workspaces {
		if w.Path != projectPath {
			filtered = append(filtered, w)
		}
	}
	// If removing the active workspace, switch to global
	if s.activeWorkspace == projectPath {
		s.SetGlobal()
	}
	return s.WriteJSONFile(s.workspacesFile, filtered)
}

// WorkspaceInfo extends WorkspaceEntry with stats about the workspace contents.
type WorkspaceInfo struct {
	Path     string `json:"path"`
	Name     string `json:"name"`
	Active   bool   `json:"active"`
	Agents   int    `json:"agents"`
	MCP      int    `json:"mcp"`
	Steering int    `json:"steering"`
	Skills   int    `json:"skills"`
	Exists   bool   `json:"exists"`
}

// ListWorkspacesWithStats returns all workspaces with content counts.
func (s *KiroService) ListWorkspacesWithStats() []WorkspaceInfo {
	workspaces := s.GetWorkspaces()
	result := make([]WorkspaceInfo, 0, len(workspaces))
	for _, w := range workspaces {
		info := WorkspaceInfo{
			Path:   w.Path,
			Name:   w.Name,
			Active: s.activeWorkspace == w.Path,
			Exists: s.dirExists(filepath.Join(w.Path, ".kiro")),
		}
		info.Agents = s.countFiles(filepath.Join(w.Path, ".kiro", "agents"), ".json")
		info.MCP = s.countMCPServers(filepath.Join(w.Path, ".kiro", "settings", "mcp.json"))
		info.Steering = s.countFiles(filepath.Join(w.Path, ".kiro", "steering"), ".md")
		info.Skills = s.countDirs(filepath.Join(w.Path, ".kiro", "skills"))
		result = append(result, info)
	}
	return result
}

// DeleteWorkspace removes the .kiro directory and removes from the workspace list.
func (s *KiroService) DeleteWorkspace(projectPath string) error {
	kiroPath := filepath.Join(projectPath, ".kiro")
	if s.dirExists(kiroPath) {
		if err := os.RemoveAll(kiroPath); err != nil {
			return fmt.Errorf("failed to delete %s: %v", kiroPath, err)
		}
		s.logger.Info("Deleted workspace at %s", kiroPath)
	}
	return s.RemoveWorkspace(projectPath)
}

// CopyWorkspace copies .kiro from source to dest project path.
func (s *KiroService) CopyWorkspace(srcProject, destProject string) error {
	srcKiro := filepath.Join(srcProject, ".kiro")
	destKiro := filepath.Join(destProject, ".kiro")
	if !s.dirExists(srcKiro) {
		return fmt.Errorf("source workspace not found: %s", srcKiro)
	}
	if err := s.copyDir(srcKiro, destKiro); err != nil {
		return fmt.Errorf("failed to copy workspace: %v", err)
	}
	s.logger.Info("Copied workspace from %s to %s", srcProject, destProject)
	return nil
}

// MoveWorkspace moves .kiro from source to dest and updates the workspace list.
func (s *KiroService) MoveWorkspace(srcProject, destProject string) error {
	if err := s.CopyWorkspace(srcProject, destProject); err != nil {
		return err
	}
	srcKiro := filepath.Join(srcProject, ".kiro")
	if err := os.RemoveAll(srcKiro); err != nil {
		return fmt.Errorf("failed to remove source: %v", err)
	}
	// Update workspace list: remove old, add new
	s.RemoveWorkspace(srcProject)
	s.AddWorkspace(destProject)
	if s.activeWorkspace == srcProject {
		s.SetWorkspace(destProject)
	}
	s.logger.Info("Moved workspace from %s to %s", srcProject, destProject)
	return nil
}

func (s *KiroService) dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func (s *KiroService) countFiles(dir, ext string) int {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return 0
	}
	count := 0
	for _, e := range entries {
		if !e.IsDir() && filepath.Ext(e.Name()) == ext {
			count++
		}
	}
	return count
}

func (s *KiroService) countDirs(dir string) int {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return 0
	}
	count := 0
	for _, e := range entries {
		if e.IsDir() && !strings.HasPrefix(e.Name(), ".") {
			count++
		}
	}
	return count
}

func (s *KiroService) countMCPServers(configPath string) int {
	var config map[string]interface{}
	s.ReadJSONFile(configPath, &config)
	if servers, ok := config["mcpServers"].(map[string]interface{}); ok {
		return len(servers)
	}
	return 0
}

func (s *KiroService) copyDir(src, dst string) error {
	return filepath.WalkDir(src, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, path)
		target := filepath.Join(dst, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0755)
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(target, data, 0644)
	})
}

// GetSystemInfo returns platform, architecture, and Kiro path details.
func (s *KiroService) GetSystemInfo() (*models.SystemInfo, error) {
	info := &models.SystemInfo{
		Platform:   runtime.GOOS,
		Arch:       runtime.GOARCH,
		IsWSL:      s.isWSL,
		HomeDir:    s.homeDir,
		KiroPath:   s.findKiroPath(),
		ConfigPath: s.configPath,
		GoVersion:  runtime.Version(),
		AppVersion: s.appVersion,
		Timestamp:  time.Now(),
	}

	return info, nil
}

// GetKiroStatus checks whether the Kiro CLI is installed and returns
// its path, version, and config directory status.
func (s *KiroService) GetKiroStatus() (map[string]interface{}, error) {
	kiroPath := s.findKiroPath()
	installed := kiroPath != ""

	// Check if config directory exists
	configExists := false
	if _, err := os.Stat(s.configPath); err == nil {
		configExists = true
	}

	status := map[string]interface{}{
		"installed":    installed,
		"configExists": configExists,
		"kiroPath":     kiroPath,
		"configPath":   s.configPath,
	}

	if installed {
		if version, err := s.getKiroVersion(); err == nil {
			status["version"] = version
		}
	}

	return status, nil
}

func (s *KiroService) findKiroPath() string {
	// Check common locations
	paths := []string{
		filepath.Join(s.homeDir, ".local", "bin", "kiro-cli"),
		"/usr/local/bin/kiro-cli",
		"/usr/bin/kiro-cli",
	}

	for _, path := range paths {
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}

	// Check PATH
	if path, err := exec.LookPath("kiro-cli"); err == nil {
		return path
	}

	return ""
}

func (s *KiroService) getKiroVersion() (string, error) {
	kiroPath := s.findKiroPath()
	if kiroPath == "" {
		return "", fmt.Errorf("kiro-cli not found")
	}

	// #nosec G204 - kiroPath is from findKiroPath() which validates known paths
	cmd := exec.Command(kiroPath, "--version") // nosemgrep: dangerous-exec-command
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}

	return strings.TrimSpace(string(output)), nil
}

// ReadJSONFile reads the file at path and unmarshals its JSON content into v.
func (s *KiroService) ReadJSONFile(path string, v interface{}) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, v)
}

// WriteJSONFile marshals v as indented JSON and writes it to path,
// creating parent directories as needed.
func (s *KiroService) WriteJSONFile(path string, v interface{}) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}

	// Ensure directory exists
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}

	return os.WriteFile(path, data, 0644)
}

// GetKiroModels returns the list of available Kiro model identifiers.
func (s *KiroService) GetKiroModels() ([]string, error) {
	// Return only "auto" option
	// Frontend will show "Default Model" (empty) and "auto" in dropdown
	return []string{"auto"}, nil
}

// releaseURL is the GitHub releases page for manual downloads.
const releaseURL = "https://github.com/kirodotdev-labs/config-control-kiro/releases"

// releaseAPI is the GitHub API endpoint for the latest release.
const releaseAPI = "https://api.github.com/repos/kirodotdev-labs/config-control-kiro/releases/latest"

// CheckForUpdate compares the baked-in app version against the latest GitHub release.
func (s *KiroService) CheckForUpdate() *models.VersionCheck {
	result := &models.VersionCheck{
		Current:     s.appVersion,
		Latest:      s.appVersion,
		UpdateAvail: false,
		ReleaseURL:  releaseURL,
	}

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(releaseAPI)
	if err != nil {
		return result
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return result
	}

	var release struct {
		TagName string `json:"tag_name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		return result
	}

	latest := strings.TrimPrefix(release.TagName, "v")
	result.Latest = latest
	result.UpdateAvail = latest != s.appVersion && s.appVersion != "dev"

	return result
}
