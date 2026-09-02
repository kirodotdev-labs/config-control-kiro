package performance

import "testing"

func TestParseKiroUsage_EnterprisePower(t *testing.T) {
	raw := "\x1b[?25lWARNING: Duplicate agent with name foo\n" +
		"One or more mcp server did not load correctly.\n" +
		"------\n" +
		"All tools are now trusted (!). Kiro will execute tools without asking for confirmation.\n\n" +
		"Estimated Usage | resets on 2026-09-01 | KIRO POWER\n" +
		"Credits (20300.26 of 10000 covered in plan)\n" +
		"████ 203.0%\n" +
		"Since your account is through your organization, for account management please contact your account administrator.\n" +
		"Tip: to see context window usage, run /context\n"
	got, err := parseKiroUsage(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.PlanName != "KIRO POWER" {
		t.Errorf("PlanName: want KIRO POWER, got %q", got.PlanName)
	}
	if got.ResetsOn != "2026-09-01" {
		t.Errorf("ResetsOn: want 2026-09-01, got %q", got.ResetsOn)
	}
	if got.Metric != "Credits" {
		t.Errorf("Metric: want Credits, got %q", got.Metric)
	}
	if got.Used != 20300.26 {
		t.Errorf("Used: want 20300.26, got %v", got.Used)
	}
	if !got.HasLimit || got.Limit != 10000 {
		t.Errorf("Limit: want 10000, got %v (hasLimit=%v)", got.Limit, got.HasLimit)
	}
	if got.Percent < 202.9 || got.Percent > 203.1 {
		t.Errorf("Percent: want ~203.0, got %v", got.Percent)
	}
	if !got.IsEnterprise {
		t.Errorf("IsEnterprise: want true")
	}
}

func TestParseKiroUsage_FreeUsedOnly(t *testing.T) {
	raw := "Estimated Usage\n" +
		"Requests (5.00 used)\n"
	got, err := parseKiroUsage(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Metric != "Requests" || got.Used != 5.0 {
		t.Errorf("unexpected: %+v", got)
	}
	if got.HasLimit {
		t.Errorf("HasLimit: want false for 'used' form")
	}
	if got.Percent != 0 {
		t.Errorf("Percent: want 0 when no limit, got %v", got.Percent)
	}
}

func TestParseKiroUsage_DerivedPercent(t *testing.T) {
	raw := "Estimated Usage | resets on 2026-10-01 | KIRO STARTER\n" +
		"Credits (25.00 of 100 covered in plan)\n"
	got, err := parseKiroUsage(raw)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Percent < 24.9 || got.Percent > 25.1 {
		t.Errorf("Percent: want 25.0 derived, got %v", got.Percent)
	}
}

func TestParseKiroUsage_EmptyReturnsError(t *testing.T) {
	if _, err := parseKiroUsage("WARNING: nothing here\n------\n"); err == nil {
		t.Errorf("want error on unparseable input")
	}
}

func TestAnsiStrip(t *testing.T) {
	in := "\x1b[?25l\x1b[32mhello\x1b[0m\x1b[?25h"
	if got := ansiRE.ReplaceAllString(in, ""); got != "hello" {
		t.Errorf("ansi strip: got %q", got)
	}
}
