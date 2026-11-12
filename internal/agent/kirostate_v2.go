package agent

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

// Kiro's own verdict per agent, from `kiro-cli agent upgrade <dir> --dry-run`,
// which writes nothing and prints one line per file, for example:
//
//	= unchanged      game-builder.json  already universal
//	✓ would upgrade  orchestrator.json
//	↷ skipped        orchestrator.json  out of sync (not rebuilt)
//	= unchanged      v3only.json        v3-only
//	✗ error          bad.json           Invalid JSON: …
var dryRunLine = regexp.MustCompile(`^\s*\S+\s+(would upgrade|unchanged|skipped|error)\s+(\S+\.json)\s*(.*)$`)

const kiroStateTimeout = 20 * time.Second

// kiroStates caches the dry run per agents folder until a file in it changes.
type kiroStates struct {
	mu    sync.Mutex
	cache map[string]kiroStateEntry
}

type kiroStateEntry struct {
	signature string
	states    map[string][2]string // file name → state, detail
}

// parseDryRun maps each agent file to Kiro's state and detail.
func parseDryRun(out string) map[string][2]string {
	states := map[string][2]string{}
	for _, line := range strings.Split(out, "\n") {
		m := dryRunLine.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		verdict, file, detail := m[1], m[2], strings.TrimSpace(m[3])
		state := ""
		switch {
		case verdict == "would upgrade":
			state = "upgrade"
		case verdict == "error":
			state = "error"
		case detail == "already universal":
			state = "universal"
		case detail == "v3-only":
			state = "v3-only"
		case strings.HasPrefix(detail, "out of sync"):
			state = "out-of-sync"
		default:
			state = "skipped"
		}
		states[file] = [2]string{state, detail}
	}
	return states
}

// signature changes whenever a JSON agent in dir is added, removed or edited.
func signature(dir string) string {
	files, _ := filepath.Glob(filepath.Join(dir, "*.json"))
	sort.Strings(files)
	var b strings.Builder
	for _, f := range files {
		if info, err := os.Stat(f); err == nil {
			fmt.Fprintf(&b, "%s|%d|%d;", filepath.Base(f), info.ModTime().UnixNano(), info.Size())
		}
	}
	return b.String()
}

// kiroStatesFor returns Kiro's verdict for every JSON agent in dir, or nil
// when kiro-cli can't be asked (not installed, too old for agent upgrade).
func (s *AgentService) kiroStatesFor(dir string) map[string][2]string {
	if s.cli == nil {
		return nil
	}
	sig := signature(dir)
	if sig == "" {
		return nil
	}
	s.states.mu.Lock()
	defer s.states.mu.Unlock()
	if e, ok := s.states.cache[dir]; ok && e.signature == sig {
		return e.states
	}
	// Kiro prints the report on stderr, and exits non-zero when a file has an
	// error while still reporting every file.
	res, _ := s.cli.Run(context.Background(), kiroStateTimeout, "agent", "upgrade", dir, "--dry-run")
	states := parseDryRun(string(res.Stdout) + "\n" + string(res.Stderr))
	if len(states) == 0 {
		return nil
	}
	if s.states.cache == nil {
		s.states.cache = map[string]kiroStateEntry{}
	}
	s.states.cache[dir] = kiroStateEntry{signature: sig, states: states}
	return states
}

// withKiroState adds Kiro's verdict to a readiness. Kiro's "would upgrade"
// for an agent it already upgraded means its 2.x settings changed since, and
// the next V3 chat refreshes the V3 ones.
func withKiroState(r Readiness, st [2]string) Readiness {
	r.Kiro, r.KiroDetail = st[0], st[1]
	if r.Kiro == "upgrade" && r.State == ReadyV3 {
		r.State = NeedsUpgrade
	}
	return r
}
