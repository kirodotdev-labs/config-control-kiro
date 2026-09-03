package performance

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// KiroUsage is the structured shape of `kiro-cli chat --no-interactive "/usage"`.
// It is always partially populated — fields that Kiro did not print stay at
// their zero value. Raw carries the cleaned-up (ANSI-stripped) source text
// so a client can display it if parsing fails or if new fields appear.
type KiroUsage struct {
	PlanName     string  `json:"planName"`
	ResetsOn     string  `json:"resetsOn"`
	Metric       string  `json:"metric"`
	Used         float64 `json:"used"`
	Limit        float64 `json:"limit"`
	HasLimit     bool    `json:"hasLimit"`
	Percent      float64 `json:"percent"`
	IsEnterprise bool    `json:"isEnterprise"`
	FetchedAt    int64   `json:"fetchedAt"`
	Raw          string  `json:"raw"`
}

// kiroUsageTimeout bounds how long we wait for kiro-cli to respond.
// The startup cost includes MCP-server discovery and duplicate-agent
// warnings; 45s is comfortably above the observed p95 (~10s).
const kiroUsageTimeout = 45 * time.Second

// ReadKiroUsage fetches the current plan and credit picture by shelling out
// to `kiro-cli chat --no-interactive "/usage"`. There is no caching: every
// call fetches live. On failure it returns the error so the UI can prompt
// the user to log in and try again via the Refresh button.
func (s *Service) ReadKiroUsage() (*KiroUsage, error) {
	u, err := s.fetchKiroUsage()
	if err != nil {
		s.logger.Warn("performance: kiro-cli usage fetch failed: %v", err)
		return nil, err
	}
	u.FetchedAt = time.Now().Unix()
	return u, nil
}

// fetchKiroUsage does the actual shell-out and parse. It has no
// caching; callers go through ReadKiroUsage.
func (s *Service) fetchKiroUsage() (*KiroUsage, error) {
	kiroPath, err := exec.LookPath("kiro-cli")
	if err != nil {
		return nil, fmt.Errorf("kiro-cli not found on PATH")
	}

	ctx, cancel := context.WithTimeout(context.Background(), kiroUsageTimeout)
	defer cancel()

	// #nosec G204 -- kiroPath comes from exec.LookPath on a fixed binary
	// name; the argument list is a constant slice.
	cmd := exec.CommandContext(ctx, kiroPath, "chat", "--no-interactive", "/usage")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return nil, fmt.Errorf("kiro-cli /usage timed out after %s", kiroUsageTimeout)
		}
		return nil, fmt.Errorf("kiro-cli /usage exited: %w (stderr: %s)", err, strings.TrimSpace(stderr.String()))
	}

	// Kiro-cli currently writes the /usage payload to stderr (the trust-all
	// banner and warnings share the same stream), but future releases may
	// migrate it to stdout. Parse the union so we work in either world.
	return parseKiroUsage(stdout.String() + "\n" + stderr.String())
}

// ansiRE matches ANSI CSI (Control Sequence Introducer) escapes so we
// can strip them before regex matching.
var ansiRE = regexp.MustCompile(`\x1b\[[0-9;?]*[a-zA-Z]`)

// warningLineRE matches the noise Kiro emits at startup and the
// trust-all-tools banner, so the parser sees only the /usage payload.
var warningLineRE = regexp.MustCompile(`^(WARNING:|Warning:|One or more mcp server|All tools are now trusted|Agents can sometimes|Learn more at|------|Kiro is thinking|Kiro is working|\s*$)`)

// usageHeaderRE captures the "Estimated Usage | resets on <date> | <plan>" line.
// Both the date and the plan name are optional to accommodate free-tier
// users where the header format may differ.
var usageHeaderRE = regexp.MustCompile(`Estimated Usage(?:\s*\|\s*resets on\s+([^|]+?))?(?:\s*\|\s*(.+?))?\s*$`)

// usageMetricRE captures a line like:
//
//	Credits (20300.26 of 10000 covered in plan)
//	Agentic requests (12.34 of 500 covered in plan)
//	Something (5.00 used)
//
// Group 1 is the metric name, group 2 the used value, group 3 the
// optional limit, group 4 tells us whether the "covered in plan" form
// or the "used" form was matched.
var usageMetricRE = regexp.MustCompile(`^\s*([A-Za-z][A-Za-z ]*?)\s+\(([0-9.]+)(?:\s+of\s+([0-9.]+)\s+covered in plan|\s+used)\)`)

// usagePercentRE captures a trailing "203.0%" from the progress-bar line.
var usagePercentRE = regexp.MustCompile(`([0-9]+(?:\.[0-9]+)?)\s*%\s*$`)

// enterpriseHint is present in the /usage output for org-managed accounts.
const enterpriseHint = "since your account is through your organization"

// parseKiroUsage extracts a KiroUsage from cleaned-up /usage output.
// It never returns nil on success; when a field is missing the zero
// value is used. Raw is populated regardless so a UI can fall back.
func parseKiroUsage(raw string) (*KiroUsage, error) {
	clean := ansiRE.ReplaceAllString(raw, "")
	usage := &KiroUsage{}
	var kept []string

	for _, line := range strings.Split(clean, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || warningLineRE.MatchString(trimmed) {
			continue
		}
		kept = append(kept, trimmed)

		if m := usageHeaderRE.FindStringSubmatch(trimmed); m != nil {
			usage.ResetsOn = strings.TrimSpace(m[1])
			usage.PlanName = strings.TrimSpace(m[2])
			continue
		}
		if m := usageMetricRE.FindStringSubmatch(trimmed); m != nil && usage.Metric == "" {
			usage.Metric = strings.TrimSpace(m[1])
			if used, err := strconv.ParseFloat(m[2], 64); err == nil {
				usage.Used = used
			}
			if m[3] != "" {
				if limit, err := strconv.ParseFloat(m[3], 64); err == nil {
					usage.Limit = limit
					usage.HasLimit = true
				}
			}
			continue
		}
		if m := usagePercentRE.FindStringSubmatch(trimmed); m != nil && usage.Percent == 0 {
			if pct, err := strconv.ParseFloat(m[1], 64); err == nil {
				usage.Percent = pct
			}
			continue
		}
		if strings.Contains(strings.ToLower(trimmed), enterpriseHint) {
			usage.IsEnterprise = true
			continue
		}
	}

	usage.Raw = strings.Join(kept, "\n")

	// Derive percent from used/limit when Kiro did not print a bar.
	if usage.Percent == 0 && usage.HasLimit && usage.Limit > 0 {
		usage.Percent = usage.Used / usage.Limit * 100
	}

	if usage.PlanName == "" && usage.Metric == "" && usage.Raw == "" {
		return nil, fmt.Errorf("kiro-cli /usage produced no parseable output")
	}
	return usage, nil
}
