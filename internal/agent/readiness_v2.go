package agent

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"kiromanager/internal/shared/ordered"
)

// V3 readiness states. Only agents that need something get a non-"v3" state,
// so a user who is already on V3 sees nothing extra.
const (
	ReadyV3       = "v3"      // V3 format, or a universal config made by Kiro's upgrade
	NeedsUpgrade  = "upgrade" // has CLI 2.x fields that V3 ignores
	BlockedOnV3   = "blocked" // V3 starts its default agent instead, until it is upgraded
	upgradeMarker = "kiroUpgrade"
)

// v2ToolSettings are CLI 2.x toolsSettings keys that V3 replaced with permission rules.
var v2ToolSettings = map[string]bool{
	"read": true, "write": true, "glob": true, "grep": true, "shell": true, "aws": true, "use_aws": true,
	"fs_read": true, "fs_write": true, "execute_bash": true, "execute_cmd": true, "web_fetch": true, "web_search": true,
	"subagent": true, // availableAgents/trustedAgents: V3 uses subagent/<name> tools and a subagent permission rule
}

// v2Tools are CLI 2.x tool names in `tools` that V3 calls something else.
var v2Tools = map[string]bool{
	"fs_read": true, "fs_write": true, "execute_bash": true, "execute_cmd": true, "use_aws": true, "aws": true,
	"use_subagent": true, "report_issue": true, "thinking": true, "todo": true, "todo_list": true, "delegate": true,
	"glob": true, "grep": true,
}

// Readiness says whether an agent is ready for Kiro CLI V3 and why not.
type Readiness struct {
	State string `json:"state"`
	// Converted are the CLI 2.x settings Kiro's upgrade turns into V3 ones
	// (or turned into, for an agent Kiro already upgraded).
	Converted []string `json:"converted,omitempty"`
	// NotCarried are the CLI 2.x settings V3 has no equivalent for: they
	// keep working only in 2.x chats.
	NotCarried []string `json:"notCarried,omitempty"`
	Upgradable bool     `json:"upgradable"`       // Kiro's upgrade handles this file (JSON only)
	Backup     string   `json:"backup,omitempty"` // newest backup from an upgrade, for Restore
	Universal  bool     `json:"universal,omitempty"`
	// Kiro is Kiro's own verdict from `kiro-cli agent upgrade --dry-run`:
	// universal, upgrade, out-of-sync, v3-only, skipped or error. Empty when
	// kiro-cli couldn't be asked.
	Kiro       string `json:"kiro,omitempty"`
	KiroDetail string `json:"kiroDetail,omitempty"`
}

// readiness inspects a spec. Rules follow kiro.dev/docs/custom-agents/configuration-reference
// and /cli/v3/upgrade-agent ("What gets converted").
func readiness(path string, spec *ordered.Object, f format) Readiness {
	r := Readiness{State: ReadyV3, Upgradable: f == formatJSON, Backup: latestBackup(path), Universal: spec.Has(upgradeMarker)}
	conv := func(s string) { r.Converted = append(r.Converted, s) }
	lost := func(s string) { r.NotCarried = append(r.NotCarried, s) }
	blocking := false
	if spec.Has("allowedTools") {
		conv("allowedTools → allow rules in permissions")
		blocking = true
	}
	var settings map[string]any
	if ok, _ := spec.Get("toolsSettings", &settings); ok {
		var keys []string
		for k := range settings {
			if v2ToolSettings[k] && k != "subagent" {
				keys = append(keys, k)
			}
		}
		sort.Strings(keys)
		if len(keys) > 0 {
			conv(fmt.Sprintf("toolsSettings (%s) → permission rules", strings.Join(keys, ", ")))
			blocking = true
		}
		if sub, ok := settings["subagent"].(map[string]any); ok {
			conv("toolsSettings.subagent → subagent/<name> in tools, and an allow rule for the agents that start without asking")
			blocking = true
			if _, ok := sub["agentPermissions"]; ok {
				lost("toolsSettings.subagent.agentPermissions: V3 checks a sub-agent's tool calls against this agent's rules, not per sub-agent.")
			}
		}
	}
	if raw, ok := spec.Raw("hooks"); ok && strings.HasPrefix(strings.TrimSpace(string(raw)), "{") {
		conv("hooks (CLI 2.x format) → a V3 hooks list (agentSpawn becomes SessionStart)")
	}
	var tools []any
	if ok, _ := spec.Get("tools", &tools); ok {
		var old, aws []string
		for _, t := range tools {
			s, ok := t.(string)
			switch {
			case !ok:
			case s == "use_aws" || s == "aws":
				aws = append(aws, s)
			case v2Tools[s]:
				old = append(old, s)
			}
		}
		if len(old) > 0 {
			conv(fmt.Sprintf("tools (%s) → V3 tool names; the 2.x names stay for 2.x chats", strings.Join(old, ", ")))
		}
		if len(aws) > 0 {
			lost(fmt.Sprintf("tools (%s): V3 has no built-in AWS tool. Use an AWS MCP server instead.", strings.Join(aws, ", ")))
		}
	}
	var aliases map[string]any
	if ok, _ := spec.Get("toolAliases", &aliases); ok {
		names := make([]string, 0, len(aliases))
		for _, v := range aliases {
			if s, ok := v.(string); ok {
				names = append(names, s)
			}
		}
		sort.Strings(names)
		if len(names) > 3 {
			names = append(names[:3], "…")
		}
		lost(fmt.Sprintf("toolAliases (%s): V3 has no aliases. Prompts, skills and steering that name an alias must use the tool's real name.", strings.Join(names, ", ")))
	}
	var shortcut string
	if ok, _ := spec.Get("keyboardShortcut", &shortcut); ok {
		lost(fmt.Sprintf("keyboardShortcut (%s): V3 has no agent shortcut. Switch agents with /agent.", shortcut))
	}
	if spec.Has("useLegacyMcpJson") {
		lost("useLegacyMcpJson: V3 reads includeMcpJson instead.")
	}
	switch {
	case r.Universal:
		// Kiro keeps the 2.x fields next to the generated V3 ones on purpose.
	case blocking && !spec.Has("permissions"):
		r.State = BlockedOnV3
	case len(r.Converted)+len(r.NotCarried) > 0:
		r.State = NeedsUpgrade
	}
	return r
}

// latestBackup returns the newest `<path>.bak` or `<path>.bak.N`, or "".
func latestBackup(path string) string {
	best, bestN := "", -1
	matches, _ := filepath.Glob(path + ".bak*")
	for _, m := range matches {
		suffix := strings.TrimPrefix(m, path+".bak")
		n := 0
		if suffix != "" {
			v, err := strconv.Atoi(strings.TrimPrefix(suffix, "."))
			if err != nil || !strings.HasPrefix(suffix, ".") {
				continue
			}
			n = v + 1
		}
		if info, err := os.Stat(m); err == nil && info.Mode().IsRegular() && n > bestN {
			best, bestN = m, n
		}
	}
	return best
}

// nextBackup returns the backup name Kiro would use: `.bak`, then `.bak.1`, `.bak.2`…
func nextBackup(path string) string {
	if _, err := os.Stat(path + ".bak"); err != nil {
		return path + ".bak"
	}
	for i := 1; ; i++ {
		p := fmt.Sprintf("%s.bak.%d", path, i)
		if _, err := os.Stat(p); err != nil {
			return p
		}
	}
}
