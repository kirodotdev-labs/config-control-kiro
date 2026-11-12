// Package main starts Config Control for Kiro: a local web UI for managing
// Kiro CLI configuration, served on 127.0.0.1 only.
package main

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"os/signal"
	"slices"
	"syscall"
	"time"

	"kiromanager/internal/server"
	"kiromanager/internal/shared/browser"
	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
	"kiromanager/internal/update"
)

//go:embed web/dist
var webFiles embed.FS

// Version is set at build time via -ldflags "-X main.Version=x.y.z".
var Version = "dev"

const defaultPort = 3030

func main() {
	logger := utils.NewLogger()
	defer logger.Close()
	if err := run(logger); err != nil {
		logger.Error("%v", err)
		os.Exit(1)
	}
}

// run wires services, starts the server, and blocks until SIGINT/SIGTERM.
func run(logger *utils.Logger) error {
	kiro := system.NewKiroService(logger, Version)
	// After a self-update the new version takes over the old one's port and
	// session, so the open page keeps working and no new tab opens.
	port, token, updatedFrom, handoff := update.TakeHandoff()
	var err error
	if handoff {
		logger.Info("Updated from %s to %s", updatedFrom, Version)
		if err = server.WaitForPort(port, 20*time.Second); err != nil {
			return err
		}
	} else {
		if token, err = server.NewToken(); err != nil {
			return err
		}
		if port, err = server.FindPort(defaultPort); err != nil {
			return err
		}
	}
	webFS, err := fs.Sub(webFiles, "web/dist")
	if err != nil {
		return fmt.Errorf("embedded web assets: %w", err)
	}
	handlers := server.NewHandlers(kiro, logger)
	var srv *http.Server
	updater := update.New(update.Options{
		Version: Version, GlobalDir: kiro.GlobalConfigPath(), Port: port, Token: token, Logger: logger, UpdatedFrom: updatedFrom,
		Shutdown: func(ctx context.Context) error { return srv.Shutdown(ctx) },
	})
	handlers.Update = update.NewHandler(updater)
	srv, err = server.New(server.Config{
		Port: port, Token: token, WebFS: webFS, Logger: logger,
		Handlers: handlers, OnAPI: updater.Seen,
	})
	if err != nil {
		return err
	}
	updateCtx, stopUpdates := context.WithCancel(context.Background())
	defer stopUpdates()
	go updater.Run(updateCtx)

	url := fmt.Sprintf("http://127.0.0.1:%d", port)
	errs := make(chan error, 1)
	go func() {
		logger.Info("Config Control for Kiro running on %s", url)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errs <- err
		}
	}()
	if !handoff && !slices.Contains(os.Args[1:], "--no-browser") {
		openBrowser(logger, url, kiro.IsWSL())
	}

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	select {
	case err := <-errs:
		return fmt.Errorf("server: %w", err)
	case <-quit:
	}
	logger.Info("Shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return srv.Shutdown(ctx)
}

// openBrowser opens the UI shortly after start; failure is non-fatal.
func openBrowser(logger *utils.Logger, url string, isWSL bool) {
	go func() {
		time.Sleep(500 * time.Millisecond)
		if err := browser.Open(url, isWSL); err != nil {
			logger.Warn("Could not open a browser (%v); open %s manually", err, url)
		}
	}()
}
