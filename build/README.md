# Config Control for Kiro — Build Pipeline

Automated build and release pipeline with security checks.

## Structure

```
build/
├── VERSION              # Current version (semver)
├── pipeline.sh          # Main orchestrator - run this
├── security-checks.sh   # Security validations
└── build-binaries.sh    # Cross-platform builds
```

## Prerequisites

1. **git-secrets** — Secret scanning
   ```bash
   git secrets --install
   git secrets --register-aws
   ```

2. **nancy** — Go CVE scanner
   ```bash
   go install github.com/sonatype-nexus-community/nancy@latest
   ```

## Usage

### Using Makefile (recommended)

```bash
make build     # Build for current platform
make test      # Run Go tests
make release   # Full pipeline (security + all platforms)
make clean     # Remove all build artifacts
```

### Using scripts directly

```bash
./build/pipeline.sh          # Full release
./build/security-checks.sh   # Security only
./build/build-binaries.sh    # Build only
```

## Version Management

Edit `build/VERSION` before each release:

- **Bug fix**: `1.0.0` → `1.0.1`
- **New feature**: `1.0.0` → `1.1.0`
- **Breaking change**: `1.0.0` → `2.0.0`

## Security Checks

The pipeline runs these before building:

1. **Secret Scanning** — git-secrets
2. **Go CVE Scan** — nancy
3. **Node CVE Scan** — npm audit

If any check fails, the build stops.

## Build Output

```
releases/
├── cckiro-linux-amd64
├── cckiro-mac-intel
├── cckiro-mac-arm
└── cckiro.exe
```

## Troubleshooting

**"nancy not found"**
```bash
go install github.com/sonatype-nexus-community/nancy@latest
export PATH=$PATH:$(go env GOPATH)/bin
```

**"npm audit fails"**
```bash
cd client
npm audit fix
npm audit --audit-level=high
```
