# Dependency & Upgrade Policy

Config Control for Kiro stays on **latest stable** so a fresh clone is current,
maintained, and vulnerability-free. You cannot make software immune to library
changes — a major version will eventually change an API and require edits. The
goal of this policy is to make upgrades **small, caught instantly, and quick to
fix** instead of a once-every-few-years catastrophic migration.

## The three mechanisms

### 1. Automated upgrade PRs (Dependabot) — `.github/dependabot.yml`
Dependabot opens PRs as new versions release (npm, Go modules, GitHub Actions),
grouped so you review a few PRs, not dozens. Minor/patch are batched; majors
(React, MUI, tooling) come as their own PRs because they may need code changes.
**This is what stops silent drift.** Merge these regularly — being days behind
is a 10-minute review; being years behind is the migration we did once already.

### 2. CI gate — `.github/workflows/build.yml`
Every push/PR to `main` and `v3-upgrade` runs `make test` + `make build` on
Linux and macOS, plus `npm audit --audit-level=high`. A breaking upgrade or a
newly-disclosed CVE turns the PR **red immediately**, pointing at the problem.

### 3. Freshness check — `make freshness`
Run locally any time:
- `go list -m -u all` — available Go module updates
- `npm outdated` — outdated frontend packages
- `npm audit --audit-level=high` — fails on high/critical vulnerabilities

## The upgrade rhythm
1. Dependabot opens a grouped PR.
2. CI builds + tests + audits it automatically.
3. Green → review the diff → merge. Red → the failure names what broke; fix it
   in that PR.
4. For framework majors (React, MUI), smoke-test the running UI before merging —
   "builds" is not "works".

## Floor-low, installed-latest (Go)
`go.mod` pins a **low floor** (`go 1.25`) so the project builds on any current
or future patched toolchain — it never requires one exact version. "Latest" is
controlled by the toolchain **installed** on the machine (keep it current), not
by the floor. On locked-down networks set `GOPROXY=direct GOSUMDB=off` so module
fetches come straight from the source host rather than a blocked proxy.

## Reducing blast radius over time (incremental)
Today most files import MUI / @tanstack/react-query directly, so a breaking
change touches many files. Over time, prefer routing library usage through thin
house components/hooks (an adapter layer) so a future library swap touches a few
wrapper files instead of the whole app. Do this incrementally as files are
touched — not as a big-bang rewrite.

## Never again
The project fell behind because nothing watched for releases and versions were
frozen at scaffold time. Mechanisms 1–3 above are the guardrail. Keep merging
the Dependabot PRs and the project stays current by construction.
