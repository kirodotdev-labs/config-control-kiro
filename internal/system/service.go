// Package system provides core services: the active configuration scope
// (global ~/.kiro or a workspace), V3 surface paths, system info, and the
// app update check.
package system

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"

	"kiromanager/internal/shared/utils"
)

// WorkspaceMode is the active configuration scope.
type WorkspaceMode string

const (
	// ModeGlobal is the global ~/.kiro scope.
	ModeGlobal WorkspaceMode = "global"
	// ModeWorkspace is a project's .kiro scope.
	ModeWorkspace WorkspaceMode = "workspace"
)

// WorkspaceEntry is a saved workspace.
type WorkspaceEntry struct {
	Path string `json:"path"`
	Name string `json:"name"`
}

// KiroService owns the active scope and resolves every V3 surface path. It is
// safe for concurrent use: HTTP handlers read the scope while others switch it.
type KiroService struct {
	logger           *utils.Logger
	globalConfigPath string // always the global Kiro home (~/.kiro or KIRO_HOME)
	homeDir          string
	isWSL            bool
	appVersion       string
	workspacesFile   string // <global>/kiroui/workspaces.json
	mcpSizes         *MCPSizes

	mu              sync.RWMutex
	configPath      string // active .kiro path
	mode            WorkspaceMode
	activeWorkspace string // project root in workspace mode
}

// scope is an immutable snapshot of the mutable scope fields.
type scope struct {
	configPath      string
	mode            WorkspaceMode
	activeWorkspace string
}

// NewKiroService creates a KiroService in global mode.
func NewKiroService(logger *utils.Logger, appVersion string) *KiroService {
	homeDir, _ := os.UserHomeDir()
	configPath := resolveKiroHome(homeDir)
	return &KiroService{
		logger:           logger,
		configPath:       configPath,
		globalConfigPath: configPath,
		homeDir:          homeDir,
		isWSL:            detectWSL(),
		appVersion:       appVersion,
		mode:             ModeGlobal,
		workspacesFile:   filepath.Join(configPath, "kiroui", "workspaces.json"),
		mcpSizes:         newMCPSizes(configPath),
	}
}

// snapshot returns a consistent copy of the active scope.
func (s *KiroService) snapshot() scope {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return scope{configPath: s.configPath, mode: s.mode, activeWorkspace: s.activeWorkspace}
}

// IsWSL reports whether the app runs inside Windows Subsystem for Linux.
func (s *KiroService) IsWSL() bool { return s.isWSL }

// detectWSL inspects /proc/version for a Microsoft/WSL kernel.
func detectWSL() bool {
	if runtime.GOOS != "linux" {
		return false
	}
	data, err := os.ReadFile("/proc/version")
	if err != nil {
		return false
	}
	v := strings.ToLower(string(data))
	return strings.Contains(v, "microsoft") || strings.Contains(v, "wsl")
}

// resolveKiroHome returns the global Kiro config directory. KIRO_HOME overrides
// ~/.kiro, but (mirroring kiro-cli) a relative path, a filesystem root, the
// home directory, or one of its ancestors is ignored.
func resolveKiroHome(homeDir string) string {
	defaultPath := filepath.Join(homeDir, ".kiro")
	raw := strings.TrimSpace(os.Getenv("KIRO_HOME"))
	if raw == "" || !filepath.IsAbs(raw) {
		return defaultPath
	}
	clean := filepath.Clean(raw)
	if filepath.Dir(clean) == clean {
		return defaultPath // filesystem root
	}
	if homeDir != "" {
		home := filepath.Clean(homeDir)
		if rel, err := filepath.Rel(clean, home); err == nil && !strings.HasPrefix(rel, "..") {
			return defaultPath // home itself or an ancestor of home
		}
	}
	return clean
}
