VERSION := $(shell cat build/VERSION)
BINARY  := cckiro
LDFLAGS := -s -w -X main.Version=$(VERSION)

.PHONY: all dev build test clean frontend backend release lint help

## help: Show this help message
help:
	@grep -E '^## ' Makefile | sed 's/## //'

## dev: Start frontend dev server (hot reload) + Go backend
dev:
	@echo "Starting frontend dev server..."
	cd client && npm run dev &
	@echo "Starting Go backend..."
	go run .

## test: Run all Go tests
test:
	go test ./internal/... -count=1 -timeout 30s

## lint: Run Go vet and React lint
lint:
	go vet ./...
	cd client && npm run lint

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
