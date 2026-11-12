package system

import (
	"os"

	"kiromanager/internal/shared/miniyaml"
)

// Kiro's trust for a Workspace, as the permissions editor and MCP measuring see it.
const (
	TrustHome      = "home"      // the Workspace is the home folder, which Kiro doesn't ask about
	trustTrusted   = "trusted"   // the user chose "Trust, continue" in Kiro CLI V3
	TrustUntrusted = "untrusted" // anything else
)

// trustKey and trustCaseKey are the fields Kiro CLI V3 writes in the
// per-workspace permissions file when you choose "Trust, continue".
const (
	trustKey     = "workspaceTrusted"
	trustCaseKey = "workspaceTrustCase"
)

// TrustFrom reads Kiro's saved trust from a parsed per-workspace permissions
// file. Kiro counts a case-folded trust entry only without a workspaceTrustCase key.
func TrustFrom(parsed map[string]any) string {
	if parsed[trustKey] == true && parsed[trustCaseKey] == nil {
		return trustTrusted
	}
	return TrustUntrusted
}

// WorkspaceTrust is Kiro's trust for the active Workspace, or "" in Global.
func (s *KiroService) WorkspaceTrust() string {
	if s.GetMode() != ModeWorkspace {
		return ""
	}
	if s.ActiveWorkspaceIsHome() {
		return TrustHome
	}
	data, err := os.ReadFile(s.PermissionsPath())
	if err != nil {
		return TrustUntrusted
	}
	parsed, err := miniyaml.Decode(string(data))
	if err != nil {
		return TrustUntrusted
	}
	return TrustFrom(parsed)
}
