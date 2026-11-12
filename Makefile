VERSION := $(shell cat build/VERSION)
BINARY  := cckiro
LDFLAGS := -s -w -X main.Version=$(VERSION)

.PHONY: all dev build test clean frontend backend release lint freshness help

## help: Show this help message
help:
	@grep -E '^## ' Makefile | sed 's/## //'

## dev: Start frontend dev server (hot reload) + Go backend
dev:
	@echo "Starting frontend dev server..."
	cd client && npm run dev &
	@echo "Starting Go backend..."
	go run .

## test: Run Go tests (with the race detector) and frontend domain tests
# The frontend tests import client packages (e.g. yaml), so install them first;
# npm ci uses the lock file exactly, as on CI.
test:
	go test -race ./internal/... ./tools/... -count=1 -timeout 120s
	cd client && npm ci --silent --no-audit --no-fund && npm test

## lint: Go vet + staticcheck, and ESLint for the frontend
# Go packages are listed explicitly: ./... would also pick up Go files that
# ship inside client/node_modules.
lint:
	@# main.go embeds web/dist; vet needs it to exist, even before a build.
	@[ -e web/dist/index.html ] || { mkdir -p web/dist && printf '<!doctype html>' > web/dist/index.html; }
	go vet . ./internal/... ./tools/...
	@if command -v staticcheck >/dev/null; then staticcheck . ./internal/... ./tools/...; else go run honnef.co/go/tools/cmd/staticcheck@latest . ./internal/... ./tools/...; fi
	cd client && { [ -d node_modules ] || npm ci --silent --no-audit --no-fund; } && npm run lint

## freshness: Report outdated deps and FAIL on high-severity vulnerabilities
freshness:
	@echo "== Go: available module updates =="
	-go list -m -u all 2>/dev/null | grep '\[' || echo "  all Go modules current"
	@echo ""
	@echo "== npm: outdated packages =="
	-cd client && npm outdated || true
	@echo ""
	@echo "== npm: security audit (fails on high/critical) =="
	cd client && npm audit --audit-level=high

## frontend: Build React frontend
frontend:
	cd client && npm install --silent && npm run build

## backend: Build Go binary for current platform
backend: frontend
	rm -rf web/dist && mkdir -p web/dist
	cp -r client/dist/* web/dist/
	go build -ldflags "$(LDFLAGS)" -o $(BINARY) .

## build: Build frontend + backend for current platform
build: backend

## release: Build release binaries for all platforms
release: frontend
	bash build/pipeline.sh

## clean: Remove all build artifacts and dependencies
clean:
	rm -f $(BINARY)
	rm -rf releases/*
	rm -rf web/dist
	rm -rf client/dist
	rm -rf client/node_modules

## all: Clean, test, and build
all: clean test build
