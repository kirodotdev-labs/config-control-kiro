package kirocli

import (
	"context"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"kiromanager/internal/shared/utils"
)

// Plan is Kiro's own estimate of the account's credit use this billing
// month, read from `kiro-cli chat --no-interactive /usage`. It covers every
// surface and computer (IDE, CLI V3 and 2.x, Web), unlike the chat files
// on this computer. Fields Kiro didn't print stay empty.
//
// Parsing follows the Performance dashboard by @nataizya (main, 3020bde).
type Plan struct {
	Name     string    `json:"name,omitempty"`     // e.g. "KIRO POWER"
	ResetsOn string    `json:"resetsOn,omitempty"` // as Kiro prints it, usually YYYY-MM-DD
	Metric   string    `json:"metric,omitempty"`   // "Credits"
	Used     float64   `json:"used"`
	Limit    float64   `json:"limit,omitempty"`
	HasLimit bool      `json:"hasLimit"`
	Percent  float64   `json:"percent"`
	Overages *Overages `json:"overages,omitempty"` // nil when Kiro didn't say
	Managed  bool      `json:"managed"`            // the plan is run by an organization's admin
	Free     bool      `json:"free"`
	Raw      string    `json:"raw,omitempty"` // Kiro's lines, for "Details"
	Problem  *Problem  `json:"problem,omitempty"`
	Checked  time.Time `json:"checked"`
}

// Overages is whether the account may keep working past its plan.
type Overages struct {
	Enabled bool    `json:"enabled"`
	Credits float64 `json:"credits"` // used beyond the plan so far
}

const (
	planTimeout = 45 * time.Second // kiro-cli starts MCP servers first
	planTTL     = 5 * time.Minute  // Kiro updates usage at least every 5 minutes
)

var (
	planHeaderRe   = regexp.MustCompile(`(?i)Estimated Usage(?:\s*\|\s*resets on\s+([^|]+?))?(?:\s*\|\s*(.+?))?\s*$`)
	planMetricRe   = regexp.MustCompile(`^([A-Za-z][A-Za-z ]*?)\s*\(([0-9][0-9.,]*)(?:\s+of\s+([0-9][0-9.,]*)\s+covered in plan|\s+used)\)(?:\s*,?\s*([0-9.]+)\s*%)?`)
	planPercentRe  = regexp.MustCompile(`([0-9]+(?:\.[0-9]+)?)\s*%\s*$`)
	planOverOnRe   = regexp.MustCompile(`(?i)^overages?\s*:\s*(enabled|disabled|on|off)\b`)
	planOverCredRe = regexp.MustCompile(`(?i)^overages?\s+credits?\s*:\s*([0-9][0-9.,]*)`)
	planManagedRe  = regexp.MustCompile(`(?i)managed by your organi[sz]ation|through your organi[sz]ation`)
)

func num(s string) float64 {
	f, _ := strconv.ParseFloat(strings.ReplaceAll(s, ",", ""), 64)
	return f
}

// parsePlan reads /usage output. ok is false when nothing recognisable was printed.
func parsePlan(out string) (Plan, bool) {
	var p Plan
	var kept []string
	for _, line := range strings.Split(ansiRe.ReplaceAllString(out, ""), "\n") {
		t := strings.TrimSpace(line)
		if t == "" || strings.HasPrefix(t, "WARNING") || strings.HasPrefix(t, "Warning") {
			continue
		}
		kept = append(kept, t)
		switch {
		case planHeaderRe.MatchString(t) && strings.Contains(strings.ToLower(t), "estimated usage"):
			m := planHeaderRe.FindStringSubmatch(t)
			p.ResetsOn, p.Name = strings.TrimSpace(m[1]), strings.TrimSpace(m[2])
		case planOverCredRe.MatchString(t):
			if p.Overages == nil {
				p.Overages = &Overages{}
			}
			p.Overages.Credits = num(planOverCredRe.FindStringSubmatch(t)[1])
		case planOverOnRe.MatchString(t):
			v := strings.ToLower(planOverOnRe.FindStringSubmatch(t)[1])
			if p.Overages == nil {
				p.Overages = &Overages{}
			}
			p.Overages.Enabled = v == "enabled" || v == "on"
		case p.Metric == "" && planMetricRe.MatchString(t):
			m := planMetricRe.FindStringSubmatch(t)
			p.Metric, p.Used = strings.TrimSpace(m[1]), num(m[2])
			if m[3] != "" {
				p.Limit, p.HasLimit = num(m[3]), true
			}
			if m[4] != "" {
				p.Percent = num(m[4])
			}
		case p.Percent == 0 && planPercentRe.MatchString(t):
			p.Percent = num(planPercentRe.FindStringSubmatch(t)[1])
		}
		if planManagedRe.MatchString(t) {
			p.Managed = true
		}
	}
	if p.Percent == 0 && p.HasLimit && p.Limit > 0 {
		p.Percent = p.Used / p.Limit * 100
	}
	p.Free = strings.Contains(strings.ToUpper(p.Name), "FREE")
	p.Raw = strings.Join(kept, "\n")
	return p, p.Metric != "" || p.Name != ""
}

type planCache struct {
	mu     sync.Mutex
	cached *Plan
}

// Plan returns the account's plan usage, asking kiro-cli at most every five
// minutes unless refresh is set. Failures come back as a Problem, never an
// error, so the rest of the Usage view keeps working.
func (s *Service) Plan(refresh bool) Plan {
	s.plan.mu.Lock()
	defer s.plan.mu.Unlock()
	if c := s.plan.cached; c != nil && !refresh && time.Since(c.Checked) < planTTL {
		return *c
	}
	now := time.Now()
	res, p := s.Runner.Run(context.Background(), planTimeout, "chat", "--no-interactive", "/usage")
	if p != nil {
		return Plan{Problem: p, Checked: now}
	}
	text := string(res.Stdout) + "\n" + string(res.Stderr)
	plan, ok := parsePlan(text)
	plan.Checked = now
	if !ok {
		// Exit 0 but no usage: kiro-cli may have printed a sign-in or network message instead.
		code := Failed
		switch {
		case signedOutRe.MatchString(text):
			code = NotSignedIn
		case networkRe.MatchString(text):
			code = Unreachable
		}
		pr := problem(code, firstLines(text, 6))
		if code == Failed {
			pr.Message = "Kiro CLI didn't report plan usage in a form this app understands."
			pr.Fix = "See your usage at app.kiro.dev/account/usage. Updating Config Control for Kiro may fix this."
		}
		return Plan{Problem: pr, Checked: now}
	}
	s.plan.cached = &plan
	return plan
}

func firstLines(s string, n int) string {
	lines := strings.Split(strings.TrimSpace(ansiRe.ReplaceAllString(s, "")), "\n")
	if len(lines) > n {
		lines = lines[:n]
	}
	return strings.Join(lines, "\n")
}

// GetPlan handles GET /kiro/plan (?refresh=1).
func (h *Handler) GetPlan(w http.ResponseWriter, r *http.Request) {
	utils.RespondJSON(w, http.StatusOK, h.service.Plan(r.URL.Query().Get("refresh") == "1"))
}
