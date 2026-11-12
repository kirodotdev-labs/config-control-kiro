package agent

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
)

// pathKey normalises a path for comparison: cleaned, and lower-cased where
// the usual filesystem ignores case (Windows and macOS).
func pathKey(p string) string {
	p = filepath.Clean(p)
	if runtime.GOOS == "windows" || runtime.GOOS == "darwin" {
		p = strings.ToLower(p)
	}
	return p
}

// globMatch reports whether path matches a glob where ** spans folders, * and
// ? stay within one folder.
func globMatch(pattern, path string) bool {
	var b strings.Builder
	b.WriteString("^")
	p := filepath.ToSlash(pattern)
	for i := 0; i < len(p); i++ {
		switch c := p[i]; {
		case strings.HasPrefix(p[i:], "**/"):
			b.WriteString("(?:.*/)?")
			i += 2
		case strings.HasPrefix(p[i:], "**"):
			b.WriteString(".*")
			i++
		case c == '*':
			b.WriteString("[^/]*")
		case c == '?':
			b.WriteString("[^/]")
		default:
			b.WriteString(regexp.QuoteMeta(string(c)))
		}
	}
	b.WriteString("$")
	re, err := regexp.Compile(b.String())
	return err == nil && re.MatchString(filepath.ToSlash(path))
}

// steeringInclusion returns a steering file's inclusion mode ("always" when unset).
func steeringInclusion(path string) string {
	f, err := os.Open(path)
	if err != nil {
		return "always"
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	if !sc.Scan() || strings.TrimSpace(sc.Text()) != "---" {
		return "always"
	}
	for i := 0; i < 40 && sc.Scan(); i++ {
		line := strings.TrimSpace(sc.Text())
		if line == "---" {
			break
		}
		if v, ok := strings.CutPrefix(line, "inclusion:"); ok {
			return strings.Trim(strings.TrimSpace(v), `"'`)
		}
	}
	return "always"
}

// disablesInheritance reads chat.disableInheritingDefaultResources from the
// Kiro settings files; a later file overrides an earlier one.
func disablesInheritance(files ...string) bool {
	disabled := false
	for _, f := range files {
		data, err := os.ReadFile(f)
		if err != nil {
			continue
		}
		var settings map[string]any
		if json.Unmarshal(data, &settings) == nil {
			if v, ok := settings["chat.disableInheritingDefaultResources"].(bool); ok {
				disabled = v
			}
		}
	}
	return disabled
}

// summarizeGlobal describes the Global steering and skills a workspace agent
// also inherits, or "" when there are none.
func summarizeGlobal(globalHome string) string {
	steering := 0
	_ = filepath.WalkDir(filepath.Join(globalHome, "steering"), func(p string, d os.DirEntry, err error) error {
		if err == nil && !d.IsDir() && strings.EqualFold(filepath.Ext(p), ".md") && steeringInclusion(p) != "manual" {
			steering++
		}
		return nil
	})
	skills := 0
	entries, _ := os.ReadDir(filepath.Join(globalHome, "skills"))
	for _, e := range entries {
		if _, err := os.Stat(filepath.Join(globalHome, "skills", e.Name(), "SKILL.md")); e.IsDir() && err == nil {
			skills++
		}
	}
	hooks, _ := filepath.Glob(filepath.Join(globalHome, "hooks", "*.json"))
	if steering+skills+len(hooks) == 0 {
		return ""
	}
	return pluralize(steering, "steering file") + ", " + pluralize(skills, "skill") + " and " + pluralize(len(hooks), "hook file")
}

func pluralize(n int, word string) string {
	if n == 1 {
		return "1 " + word
	}
	return fmt.Sprintf("%d %ss", n, word)
}
