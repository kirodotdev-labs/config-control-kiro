# Contributing to Config Control for Kiro

Thank you for your interest in contributing. We welcome bug reports, feature requests, documentation improvements, and code contributions.

## Security Issue Notifications

If you discover a potential security issue, notify AWS/Amazon Security via the [vulnerability reporting page](http://aws.amazon.com/security/vulnerability-reporting/). Please do **not** create a public GitHub issue.

## Reporting Bugs / Feature Requests

Use the [GitHub issue tracker](../../issues) to report bugs or suggest features. Before filing, check existing open or recently closed issues to avoid duplicates.

For bug reports, include:
- Steps to reproduce
- Expected vs actual behavior
- Version (`./cckiro --version` or check the dashboard)
- Platform (Linux, macOS, Windows/WSL)

## Contributing Code

### Step 1: Open an Issue

For anything beyond a trivial fix, [open an issue](../../issues/new) first to discuss the change. This avoids wasted effort on work that may not align with the project direction.

### Step 2: Fork and Clone

```bash
# Fork the repo on GitHub, then:
git clone https://github.com/YOUR_USERNAME/config-control-kiro.git
cd config-control-kiro
```

### Step 3: Create a Branch

Create a branch off `main` for your change:

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### Step 4: Make Your Changes

Follow the project patterns:

- **Go**: Each feature is a package in `internal/` with `service.go` (logic) and `handler.go` (HTTP routes). Shared utilities in `internal/shared/utils/`.
- **React**: Pages in `client/src/pages/`, reusable components in `client/src/components/`, all API calls through `client/src/services/api.js`.
- Godoc on all exported Go types and functions
- JSDoc headers on all React files
- No `console.log` — only `console.error` in catch blocks
- Reuse existing shared components and hooks before creating new ones

### Step 5: Test

```bash
make test     # Go tests — must pass
make build    # Full build — must succeed
make lint     # Go vet + React eslint
```

### Step 6: Commit and Push

```bash
git add .
git commit -m "Add feature X"   # or "Fix: description of bug"
git push origin feature/your-feature-name
```

### Step 7: Open a Pull Request

Go to the original repo and open a PR from your fork's branch → `main`.

In your PR description:
- Describe what changed and why
- Reference the issue: `Fixes #123`
- Note any new dependencies or breaking changes

### PR Review

- A maintainer will review your PR
- Address any requested changes by pushing new commits to your branch
- Once approved, your PR will be squash-merged into `main`

### PR Checklist

- [ ] `make test` passes
- [ ] `make build` succeeds
- [ ] Tests added for new code
- [ ] Follows existing handler/service pattern (Go) or pages/components pattern (React)
- [ ] Godoc/JSDoc present
- [ ] No `console.log`, no commented-out code, no unused imports

## Development Setup

Requires Go 1.22+ and Node.js 18+.

```bash
make dev      # Frontend hot-reload + Go backend
make build    # Production build
make test     # Run all Go tests
make lint     # Linting
make clean    # Remove build artifacts
```

## Code of Conduct

This project has adopted the [Amazon Open Source Code of Conduct](https://aws.github.io/code-of-conduct).
For more information see the [Code of Conduct FAQ](https://aws.github.io/code-of-conduct-faq) or contact
opensource-codeofconduct@amazon.com with any additional questions or comments.

## Licensing

See the [LICENSE](LICENSE) file for our project's licensing. We will ask you to confirm the licensing of your contribution.
