package kirocli

import (
	"context"
	"encoding/json"
	"kiromanager/internal/shared/ghfolder"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"
)

// Status levels for the connection indicator.
const (
	LevelOK       = "ok"       // installed, signed in, reachable, current
	LevelDegraded = "degraded" // works, but a feature needs a newer kiro-cli
	LevelDown     = "down"     // Kiro features can't run
)

// Account is the signed-in Kiro identity, from `kiro-cli whoami`.
type Account struct {
	Type  string `json:"type,omitempty"`
	Email string `json:"email,omitempty"`
}

// Features reports which kiro-cli capabilities this install has, probed from
// its help output rather than guessed from a version number.
type Features struct {
	V3           bool `json:"v3"`           // `kiro-cli chat --v3`
	AgentUpgrade bool `json:"agentUpgrade"` // 2.x: `kiro-cli agent upgrade <dir>`, for 2.x configs
	Powers       bool `json:"powers"`       // `kiro-cli powers install|uninstall`
}

// Status is the health of the user's Kiro setup.
type Status struct {
	Level     string    `json:"level"`
	Installed bool      `json:"installed"`
	Path      string    `json:"path,omitempty"`
	Version   string    `json:"version,omitempty"`
	SignedIn  bool      `json:"signedIn"`
	Account   *Account  `json:"account,omitempty"`
	Reachable bool      `json:"reachable"`
	Features  Features  `json:"features"`
	APIKey    bool      `json:"apiKey"` // KIRO_API_KEY is set, so headless runs can authenticate
	Problem   *Problem  `json:"problem,omitempty"`
	Notes     []string  `json:"notes,omitempty"` // degraded-but-working explanations
	Checked   time.Time `json:"checked"`
}

const (
	quickTimeout = 15 * time.Second
	statusTTL    = 30 * time.Second
)

var versionRe = regexp.MustCompile(`(\d+\.\d+(?:\.\d+)?\S*)`)

// Service answers status, model and command questions about kiro-cli.
type Service struct {
	Runner   *Runner
	mu       sync.Mutex
	status   *Status
	models   modelCatalog
	settings settingsCache
	builtins builtinCache
	plan     planCache
	catalog  catalogCache
	fetch    *ghfolder.Fetcher // downloads a power folder from GitHub
}

// NewService returns a Service for the installed kiro-cli.
func NewService() *Service {
	return &Service{Runner: NewRunner(), catalog: catalogCache{url: powersCatalogURL()}, fetch: ghfolder.New(nil)}
}

// Status returns the cached status, re-checking when stale or on refresh.
func (s *Service) Status(refresh bool) Status {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !refresh && s.status != nil && time.Since(s.status.Checked) < statusTTL {
		return *s.status
	}
	st := s.check()
	s.status = &st
	return st
}

// Models returns the account's models (cached), or "auto" with the reason.
func (s *Service) Models(refresh bool) ModelList { return s.models.get(s.Runner, refresh) }

// RateOf is the credit multiplier of model, from the cached model list; 0
// when it is unknown.
func (s *Service) RateOf(model string) float64 {
	for _, m := range s.Models(false).Models {
		if m.ID == model {
			return m.RateMultiplier
		}
	}
	return 0
}

func (s *Service) check() Status {
	st := Status{Checked: time.Now(), APIKey: os.Getenv("KIRO_API_KEY") != "", Path: s.Runner.Find()}
	st.Installed = st.Path != ""
	if !st.Installed {
		st.Level, st.Problem = LevelDown, problem(NotInstalled, "")
		return st
	}
	ctx := context.Background()
	var wg sync.WaitGroup
	var mu sync.Mutex
	probe := func(fn func()) { wg.Add(1); go func() { defer wg.Done(); fn() }() }
	probe(func() {
		res, _ := s.Runner.Run(ctx, quickTimeout, "--version")
		mu.Lock()
		defer mu.Unlock()
		st.Version = versionRe.FindString(string(res.Stdout))
	})
	probe(func() {
		res, p := s.Runner.Run(ctx, quickTimeout, "chat", "--help")
		mu.Lock()
		defer mu.Unlock()
		st.Features.V3 = p == nil && strings.Contains(string(res.Stdout), "--v3")
	})
	probe(func() {
		_, p := s.Runner.Run(ctx, quickTimeout, "agent", "upgrade", "--help")
		mu.Lock()
		defer mu.Unlock()
		st.Features.AgentUpgrade = p == nil
	})
	probe(func() {
		_, p := s.Runner.Run(ctx, quickTimeout, "powers", "--help")
		mu.Lock()
		defer mu.Unlock()
		st.Features.Powers = p == nil
	})
	var who *Problem
	probe(func() {
		acct, p := s.whoami(ctx)
		mu.Lock()
		defer mu.Unlock()
		st.Account, who = acct, p
		st.SignedIn = acct != nil
	})
	wg.Wait()

	if !st.SignedIn {
		st.Level, st.Problem = LevelDown, who
		return st
	}
	// Listing models needs Kiro's service, so it doubles as the reachability check.
	if list := s.models.get(s.Runner, true); list.Problem != nil {
		st.Level, st.Problem = LevelDown, list.Problem
		return st
	}
	st.Reachable, st.Level = true, LevelOK
	if !st.Features.V3 {
		st.Level = LevelDegraded
		st.Notes = append(st.Notes, "This Kiro CLI can't start V3 chats. Update it with kiro-cli update.")
	}
	if !st.Features.Powers {
		st.Level = LevelDegraded
		st.Notes = append(st.Notes, "Managing Powers from this app needs a newer Kiro CLI. Update it with kiro-cli update.")
	}
	if !st.Features.AgentUpgrade { // 2.x: remove with V2 support
		st.Level = LevelDegraded
		st.Notes = append(st.Notes, "Upgrading agents to V3 from this app needs a newer Kiro CLI. Update it with kiro-cli update.")
	}
	return st
}

// whoami returns the signed-in account, or a Problem saying why there is none.
func (s *Service) whoami(ctx context.Context) (*Account, *Problem) {
	res, p := s.Runner.Run(ctx, quickTimeout, "whoami", "--format", "json")
	var out struct {
		Account *struct{} `json:"account"`
		Type    string    `json:"accountType"`
		Email   string    `json:"email"`
	}
	parsed := json.Unmarshal(firstJSON(res.Stdout), &out) == nil
	if parsed && out.Type != "" {
		return &Account{Type: out.Type, Email: out.Email}, nil
	}
	if p != nil && p.Code != Failed && p.Code != NotSignedIn {
		return nil, p // not installed, timed out, unreachable
	}
	return nil, problem(NotSignedIn, string(res.Stderr))
}

// firstJSON returns the first line of out that looks like a JSON object
// (whoami prints extra text after it).
func firstJSON(out []byte) []byte {
	for _, line := range strings.Split(string(out), "\n") {
		if t := strings.TrimSpace(line); strings.HasPrefix(t, "{") {
			return []byte(t)
		}
	}
	return out
}
