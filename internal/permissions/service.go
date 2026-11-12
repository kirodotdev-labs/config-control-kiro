// Package permissions manages Kiro CLI V3 capability-based permission policies
// stored as permissions.yaml.
//
// V3 replaced V2's per-tool toolsSettings with a unified rules list:
//
//	rules:
//	  - capability: shell
//	    match: ["git *", "npm *"]
//	    effect: allow
//	  - capability: fs_write
//	    match: ["src/**"]
//	    exclude: ["*.lock"]
//	    effect: deny
//
// Rules are evaluated deny-overrides (deny > ask > allow) with no precedence
// between scopes. Global rules live at ~/.kiro/settings/permissions.yaml;
// workspace rules live per-user OUTSIDE the repo at
// ~/.kiro/workspace-roots/<hash>/permissions.yaml. The active scope's path is
// resolved by the system service.
//
// Preserve-by-default: the whole YAML document is round-tripped through the raw
// field map, so any top-level key beyond "rules" that a future Kiro version
// adds is retained on save.
package permissions

import (
	"encoding/json"
	"os"
	"runtime"

	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

// Service describes permissions.yaml for the active scope.
type Service struct {
	kiroService *system.KiroService
	logger      *utils.Logger
}

// NewService creates a permissions Service.
func NewService(kiroService *system.KiroService, logger *utils.Logger) *Service {
	return &Service{kiroService: kiroService, logger: logger}
}

// Rule is one permission rule (editing view).
type Rule struct {
	Capability string   `json:"capability"`
	Match      []string `json:"match,omitempty"`
	Exclude    []string `json:"exclude,omitempty"`
	Effect     string   `json:"effect"`
}

// Document describes permissions.yaml for the UI, which edits the text itself.
type Document struct {
	// Path is the resolved file path (informational for the UI).
	Path string `json:"path"`
	// Exists reports whether the file is present on disk.
	Exists bool `json:"exists"`
	// Trust is Kiro CLI's trust for the active Workspace: "trusted",
	// "untrusted" or "home" (never saved, asked at each launch). Empty in Global.
	Trust string `json:"trust,omitempty"`
	// Admin is the administrator policy, when one is deployed. Its rules
	// (deny and ask only) apply on top of yours and can't be changed here.
	Admin *AdminPolicy `json:"admin,omitempty"`
}

// AdminPolicy is managed-settings.json (kiro.dev/docs/enterprise/governance/permissions).
type AdminPolicy struct {
	Path  string `json:"path"`
	Rules []Rule `json:"rules"`
	Error string `json:"error,omitempty"`
}

// managedPath is where this OS keeps the administrator policy; tests replace it.
var managedPath = func() string { return system.ManagedSettingsPath(runtime.GOOS) }

// readAdmin reads the administrator policy, or nil when none is deployed.
func readAdmin() *AdminPolicy {
	path := managedPath()
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	admin := &AdminPolicy{Path: path, Rules: []Rule{}}
	var parsed map[string]any
	if err := json.Unmarshal(data, &parsed); err != nil {
		admin.Error = "The policy file isn't valid JSON, so Kiro may not apply it."
		return admin
	}
	admin.Rules = extractRules(parsed)
	return admin
}

// AvailableCapabilities is the V3 capability vocabulary plus meta-capabilities.
var AvailableCapabilities = []string{
	"fs_read", "fs_write", "shell", "web_fetch", "web_search", "mcp",
	"subagent", "skill", "power", "context", "diagnostics", "sandbox_network",
	"all", "builtin", "filesystem",
}

// ValidEffects are the permission effects. evaluate, the weakest, lets
// Kiro's trust classifier decide; the approve-for-me preset adds it.
var ValidEffects = []string{"allow", "ask", "deny", "evaluate"}

// Preset is a named set of rules Kiro expands when a permissions file lists
// it under "policies:" (kiro.dev/docs/permissions, "Policy presets").
type Preset struct {
	ID          string `json:"id"`
	Description string `json:"description"`
	// Since is the first Kiro CLI version that knows the preset, when it's
	// newer than the rest.
	Since string `json:"since,omitempty"`
}

// presets are Kiro's policy presets: the six in Kiro CLI 2.34's agent code,
// plus approve-for-me from the docs.
var presets = []Preset{
	{ID: "read-workspace", Description: "Read files in the workspace without asking."},
	{ID: "edit-workspace", Description: "Read and write files in the workspace without asking."},
	{ID: "read-all", Description: "Read files anywhere, and fetch and search the web, without asking."},
	{ID: "read-only-shell", Description: "Run read-only shell commands (system info, and git, cargo, npm, docker, kubectl and rustup queries) without asking."},
	{ID: "dev-shell", Description: "The read-only commands, plus git writes, builds (cargo, npm, bun, yarn) and mkdir, touch, mv, cp, ls, cat, grep and echo, without asking."},
	{ID: "approve-for-me", Description: "Workspace edits and read-only commands without asking; Kiro judges everything else that no rule settles, and asks when unsure.", Since: "2.36"},
	{ID: "allow-all", Description: "Every tool, without asking, including files outside the workspace. Deny rules still apply."},
}

// Get describes permissions.yaml for the active scope: where it is, whether
// it exists, Kiro's trust for the Workspace and the administrator policy. The
// browser reads and edits the file's text itself.
func (s *Service) Get() (*Document, error) {
	path := s.kiroService.PermissionsPath()
	doc := &Document{Path: path, Trust: s.kiroService.WorkspaceTrust(), Admin: readAdmin()}
	if _, err := os.Stat(path); err != nil {
		if os.IsNotExist(err) {
			return doc, nil // No file yet — empty policy.
		}
		return nil, err
	}
	doc.Exists = true
	return doc, nil
}

// extractRules projects a raw "rules" list onto typed Rules.
func extractRules(parsed map[string]any) []Rule {
	rules := []Rule{}
	raw, ok := parsed["rules"].([]any)
	if !ok {
		return rules
	}
	for _, item := range raw {
		m, ok := item.(map[string]any)
		if !ok {
			continue
		}
		r := Rule{}
		if v, ok := m["capability"].(string); ok {
			r.Capability = v
		}
		if v, ok := m["effect"].(string); ok {
			r.Effect = v
		}
		r.Match = toStringSlice(m["match"])
		r.Exclude = toStringSlice(m["exclude"])
		rules = append(rules, r)
	}
	return rules
}

func toStringSlice(v any) []string {
	arr, ok := v.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(arr))
	for _, e := range arr {
		if s, ok := e.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

// Meta returns the capability, effect and preset vocabularies for the UI.
func (s *Service) Meta() map[string]any {
	return map[string]any{
		"capabilities": AvailableCapabilities,
		"effects":      ValidEffects,
		"presets":      presets,
	}
}
