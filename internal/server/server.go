// Package server assembles the HTTP server: API routes behind auth and
// security middleware, plus the embedded single-page app.
package server

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"time"

	"kiromanager/internal/shared/utils"
)

// Config describes how to build the server.
type Config struct {
	Port     int
	Token    string
	WebFS    fs.FS
	Logger   *utils.Logger
	Handlers Handlers
	// OnAPI, when set, is called for every authorised API request (the
	// updater waits for a quiet moment before restarting).
	OnAPI func()
}

// New returns an http.Server bound to 127.0.0.1 only (never exposed to the network).
func New(cfg Config) (*http.Server, error) {
	spa, err := spaHandler(cfg.WebFS, cfg.Token)
	if err != nil {
		return nil, err
	}
	api := chain(apiRoutes(cfg.Handlers),
		recoverPanics(cfg.Logger), logRequests(cfg.Logger), securityHeaders, requireToken(cfg.Token), notify(cfg.OnAPI), limitBody)

	root := http.NewServeMux()
	root.Handle("/api/", api)
	root.Handle("/", spa)

	return &http.Server{
		Addr:              fmt.Sprintf("127.0.0.1:%d", cfg.Port),
		Handler:           root,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       60 * time.Second,
	}, nil
}

// FindPort returns the first free loopback port in [start, start+100).
func FindPort(start int) (int, error) {
	for port := start; port < start+100; port++ {
		l, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
		if err == nil {
			_ = l.Close()
			return port, nil
		}
	}
	return 0, fmt.Errorf("no free port in %d-%d", start, start+99)
}

// WaitForPort waits until port on 127.0.0.1 is free (the previous version is
// shutting down), so a restarted process can take it over.
func WaitForPort(port int, wait time.Duration) error {
	deadline := time.Now().Add(wait)
	for {
		l, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
		if err == nil {
			return l.Close()
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("port %d is still in use", port)
		}
		time.Sleep(200 * time.Millisecond)
	}
}

// NewToken returns a 256-bit random hex session token.
func NewToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate session token: %w", err)
	}
	return hex.EncodeToString(b), nil
}

// notify calls f (when set) for each request that reaches it.
func notify(f func()) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		if f == nil {
			return next
		}
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/api/update" { // the page's own status polling isn't use
				f()
			}
			next.ServeHTTP(w, r)
		})
	}
}
