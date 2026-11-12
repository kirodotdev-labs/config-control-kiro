package system

import (
	"os"
	"path/filepath"
)

// These resolve each V3 surface location for the ACTIVE scope. They are the
// single source of truth for surface paths; services never hard-code them.

// GetConfigPath returns the active .kiro directory.
func (s *KiroService) GetConfigPath() string { return s.snapshot().configPath }

// AgentsDir returns the agents directory for the active scope.
func (s *KiroService) AgentsDir() string { return filepath.Join(s.GetConfigPath(), "agents") }

// GlobalConfigPath returns the global Kiro home (~/.kiro or KIRO_HOME).
func (s *KiroService) GlobalConfigPath() string { return s.globalConfigPath }

// GlobalAgentsDir returns the global agents directory.
func (s *KiroService) GlobalAgentsDir() string { return filepath.Join(s.globalConfigPath, "agents") }

// MCPConfigPath returns settings/mcp.json for the active scope.
func (s *KiroService) MCPConfigPath() string {
	return filepath.Join(s.GetConfigPath(), "settings", "mcp.json")
}

// SandboxPath returns settings/sandbox.json for the active scope.
func (s *KiroService) SandboxPath() string {
	return filepath.Join(s.GetConfigPath(), "settings", "sandbox.json")
}

// HooksDir returns the standalone hooks directory for the active scope.
func (s *KiroService) HooksDir() string { return filepath.Join(s.GetConfigPath(), "hooks") }

// SteeringDir returns the steering directory for the active scope.
func (s *KiroService) SteeringDir() string { return filepath.Join(s.GetConfigPath(), "steering") }

// SkillsDir returns the skills directory for the active scope.
func (s *KiroService) SkillsDir() string { return filepath.Join(s.GetConfigPath(), "skills") }

// PermissionsPath returns permissions.yaml for the active scope. Workspace
// permissions live per-user OUTSIDE the repo at
// <global>/workspace-roots/<hash>/permissions.yaml so a cloned repo cannot
// inject rules; global ones live at <global>/settings/permissions.yaml.
func (s *KiroService) PermissionsPath() string {
	sc := s.snapshot()
	if sc.mode == ModeWorkspace && sc.activeWorkspace != "" {
		return filepath.Join(s.globalConfigPath, "workspace-roots", workspaceRootHash(sc.activeWorkspace), "permissions.yaml")
	}
	return filepath.Join(s.globalConfigPath, "settings", "permissions.yaml")
}

// SettingsPath returns settings/cli.json (Kiro CLI settings) for the active scope.
func (s *KiroService) SettingsPath() string {
	return filepath.Join(s.GetConfigPath(), "settings", "cli.json")
}

// LSPPath returns .kiro/settings/lsp.json, the language servers for code
// intelligence. Only a Workspace has one; /code init in a chat creates it.
func (s *KiroService) LSPPath() string {
	return filepath.Join(s.GetConfigPath(), "settings", "lsp.json")
}

// WorkflowsDir returns the workflow recipes directory for the active scope.
func (s *KiroService) WorkflowsDir() string { return filepath.Join(s.GetConfigPath(), "workflows") }

// SpecsDir returns the specs directory (workspace scope only).
func (s *KiroService) SpecsDir() string { return filepath.Join(s.GetConfigPath(), "specs") }

// PowersInstalledPath returns the installed-powers manifest (global scope only).
func (s *KiroService) PowersInstalledPath() string {
	return filepath.Join(s.globalConfigPath, "powers", "installed.json")
}

// KiroignorePath returns the ignore file for the active scope: the global
// <home>/settings/kiroignore, or <workspace>/.kiroignore at the project root.
// Source: kiro.dev/docs/kiroignore.
func (s *KiroService) KiroignorePath() string {
	sc := s.snapshot()
	if sc.mode == ModeWorkspace && sc.activeWorkspace != "" {
		return filepath.Join(sc.activeWorkspace, ".kiroignore")
	}
	return filepath.Join(s.globalConfigPath, "settings", "kiroignore")
}

// PromptsDir returns the saved prompts directory for the active scope
// (kiro.dev/docs/cli/chat/manage-prompts).
func (s *KiroService) PromptsDir() string { return filepath.Join(s.GetConfigPath(), "prompts") }

// ManagedSettingsPath returns the administrator policy file for this OS
// (kiro.dev/docs/enterprise/governance/permissions). Only an administrator
// can change it, so the app only reads it.
func ManagedSettingsPath(goos string) string {
	switch goos {
	case "darwin":
		return "/Library/Application Support/Kiro/managed-settings.json"
	case "windows":
		dir := os.Getenv("ProgramData")
		if dir == "" {
			dir = `C:\ProgramData`
		}
		return filepath.Join(dir, "Kiro", "managed-settings.json")
	default:
		return "/etc/kiro/managed-settings.json"
	}
}

// GlobalSandboxPath returns the Global settings/sandbox.json, the floor a
// Workspace sandbox policy can only tighten.
func (s *KiroService) GlobalSandboxPath() string {
	return filepath.Join(s.globalConfigPath, "settings", "sandbox.json")
}

// DeletableRoots lists the folders whose contents the UI may delete, for the
// active scope. Files: any file below one of Files. Folders: a direct child
// folder of one of Folders (a skill or a spec). Exact: these files only
// (lsp.json: deleting it is how Kiro turns language servers off). Nothing else
// is deletable through the app, so Kiro's own stores and other settings files are safe.
type DeletableRoots struct {
	Files   []string
	Folders []string
	Exact   []string
}

// DeletableRoots returns the deletable folders of the active scope.
func (s *KiroService) DeletableRoots() DeletableRoots {
	sources := filepath.Join(s.globalConfigPath, "power-sources")         // your own powers' folders
	installed := filepath.Join(s.globalConfigPath, "powers", "installed") // files inside an installed power; the power itself goes with Uninstall
	return DeletableRoots{
		Files:   []string{s.HooksDir(), s.SteeringDir(), s.SkillsDir(), s.PromptsDir(), s.WorkflowsDir(), s.SpecsDir(), sources, installed},
		Folders: []string{s.SkillsDir(), s.SpecsDir(), sources},
		Exact:   []string{s.LSPPath()},
	}
}
