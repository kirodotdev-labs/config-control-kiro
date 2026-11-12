package kirocli

import (
	"context"
	"encoding/json"
	"regexp"
	"strconv"
	"strings"
	"sync"
)

// Choice is one allowed value of a setting.
type Choice struct {
	Value string `json:"value"`
	Label string `json:"label,omitempty"`
}

// Setting describes one Kiro CLI setting. Everything except Key and
// Description is read from the description kiro-cli prints, so the form
// follows whatever kiro-cli version is installed.
type Setting struct {
	Key         string   `json:"key"`
	Description string   `json:"description"`
	Type        string   `json:"type"` // boolean, number, string, char, array, object
	Default     string   `json:"default,omitempty"`
	Choices     []Choice `json:"choices,omitempty"`  // the only allowed values
	Examples    []string `json:"examples,omitempty"` // suggested values (free text allowed)
	Min         *float64 `json:"min,omitempty"`
	Max         *float64 `json:"max,omitempty"`
	Restart     bool     `json:"restart,omitempty"` // takes effect when Kiro restarts
	Group       string   `json:"group"`
	Advanced    bool     `json:"advanced,omitempty"` // endpoints, telemetry ids: rarely changed
	Engine      string   `json:"engine,omitempty"`   // "v3" or "v2" when only that engine reads it, from Kiro's description
}

// SettingsCatalog is every setting this kiro-cli knows, or the reason it is unavailable.
type SettingsCatalog struct {
	Settings []Setting `json:"settings"`
	Problem  *Problem  `json:"problem,omitempty"`
}

var (
	trailerRe = regexp.MustCompile(`\s*\(([^()]*)\)\s*$`)
	quotedRe  = regexp.MustCompile(`'([^']+)'(\s*\(default\))?`)
	defaultRe = regexp.MustCompile(`default:\s*'?([^;,')]+)'?`)
	rangeRe   = regexp.MustCompile(`^\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]$`)
)

// groupNames gives a friendly heading for a key's first segment.
var groupNames = map[string]string{
	"chat": "Chat", "knowledge": "Knowledge", "mcp": "MCP", "compaction": "Compaction", "hooks": "Hooks",
	"toolSearch": "Tool search", "cleanup": "Cleanup", "voice": "Voice", "introspect": "Introspect",
}

// parseSetting turns one `settings list --all` entry into a Setting.
func parseSetting(key, desc string) Setting {
	s := Setting{Key: key, Type: "string"}
	text := strings.TrimSpace(desc)
	if m := trailerRe.FindStringSubmatch(text); m != nil {
		text = strings.TrimSpace(strings.TrimSuffix(text, m[0]))
		readTrailer(&s, m[1])
	}
	if strings.HasPrefix(key, "chat.keybindings.") || strings.HasSuffix(key, "Key") && s.Type == "char" {
		s.Group = "Keybindings"
	}
	// Quoted values are the allowed choices, unless the text says they are
	// examples of a syntax (keybindings).
	if quotes := quotedRe.FindAllStringSubmatch(text, -1); len(quotes) >= 2 && s.Type == "string" {
		examples := strings.Contains(strings.ToLower(text), "syntax") || strings.Contains(text, "e.g.")
		for _, q := range quotes {
			if examples {
				s.Examples = append(s.Examples, q[1])
				continue
			}
			s.Choices = append(s.Choices, Choice{Value: q[1]})
			if q[2] != "" && s.Default == "" {
				s.Default = q[1]
			}
		}
	}
	s.Description = strings.TrimSpace(strings.TrimRight(text, ".")) + "."
	s.Engine = engineOf(text)
	if s.Group == "" {
		first := key
		if i := strings.Index(key, "."); i > 0 {
			first = key[:i]
		}
		s.Group = groupNames[first]
		if s.Group == "" {
			s.Group = "Other"
		}
	}
	lower := strings.ToLower(key)
	s.Advanced = strings.HasPrefix(key, "api.") || strings.HasPrefix(lower, "telemetry") || strings.HasPrefix(lower, "codewhisperer")
	if s.Advanced {
		s.Group = "Advanced"
	}
	return s
}

// engineOf reads which engine a setting is for from Kiro's own wording: KAS
// is the V3 engine; "V2 TUI" and "Legacy" settings are for 2.x only.
func engineOf(desc string) string {
	switch {
	case strings.Contains(desc, "KAS") || strings.Contains(desc, "V3"):
		return "v3"
	case strings.Contains(desc, "V2 TUI") || strings.HasPrefix(desc, "Legacy"):
		return "v2"
	}
	return ""
}

// readTrailer reads "(boolean, default: false; startup-only)", "([0, 100])",
// "(single character)", "(JSON object)" and similar.
func readTrailer(s *Setting, t string) {
	low := strings.ToLower(t)
	switch {
	case strings.HasPrefix(low, "boolean"):
		s.Type = "boolean"
	case strings.HasPrefix(low, "number"):
		s.Type = "number"
	case strings.HasPrefix(low, "array"):
		s.Type = "array"
	case strings.HasPrefix(low, "object"), strings.HasPrefix(low, "json object"):
		s.Type = "object"
	case strings.HasPrefix(low, "single character"):
		s.Type = "char"
	case rangeRe.MatchString(strings.TrimSpace(t)):
		m := rangeRe.FindStringSubmatch(strings.TrimSpace(t))
		lo, _ := strconv.ParseFloat(m[1], 64)
		hi, _ := strconv.ParseFloat(m[2], 64)
		s.Type, s.Min, s.Max = "number", &lo, &hi
	}
	if m := defaultRe.FindStringSubmatch(t); m != nil {
		s.Default = strings.TrimSpace(m[1])
	}
	if i := strings.Index(low, "e.g."); i >= 0 {
		s.Examples = append(s.Examples, strings.TrimSpace(t[i+4:]))
	}
	s.Restart = strings.Contains(low, "startup-only") || strings.Contains(low, "restart")
}

type settingsCache struct {
	mu     sync.Mutex
	cached *SettingsCatalog
}

// SettingsCatalog lists the settings kiro-cli supports. The list only changes
// when kiro-cli is updated, so a successful answer is kept for the session.
func (s *Service) SettingsCatalog(refresh bool) SettingsCatalog {
	s.settings.mu.Lock()
	defer s.settings.mu.Unlock()
	if s.settings.cached != nil && !refresh {
		return *s.settings.cached
	}
	res, p := s.Runner.Run(context.Background(), quickTimeout, "settings", "list", "--all", "--format", "json")
	if p != nil {
		return SettingsCatalog{Settings: []Setting{}, Problem: p}
	}
	var raw []struct {
		Key         string `json:"key"`
		Description string `json:"description"`
	}
	if json.Unmarshal(res.Stdout, &raw) != nil {
		return SettingsCatalog{Settings: []Setting{}, Problem: problem(Failed, string(res.Stdout))}
	}
	cat := SettingsCatalog{Settings: make([]Setting, 0, len(raw))}
	for _, r := range raw {
		cat.Settings = append(cat.Settings, parseSetting(r.Key, r.Description))
	}
	s.settings.cached = &cat
	return cat
}
