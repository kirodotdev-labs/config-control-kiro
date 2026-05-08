// Package main is the entry point for the KiroManager server,
// a local web UI for managing Kiro IDE configuration.
package main

import (
	"context"
	"crypto/rand"
	"embed"
	"encoding/hex"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	"github.com/skratchdot/open-golang/open"

	"kiromanager/internal/agent"
	"kiromanager/internal/dashboard"
	"kiromanager/internal/file"
	"kiromanager/internal/fileexplorer"
	"kiromanager/internal/launcher"
	"kiromanager/internal/mcp"
	"kiromanager/internal/shared/utils"
	"kiromanager/internal/skills"
	"kiromanager/internal/changelog"
	"kiromanager/internal/steering"
	"kiromanager/internal/system"
)

//go:embed web/dist
var webFiles embed.FS

// Version is set at build time via -ldflags "-X main.Version=x.y.z"
var Version = "dev"

const defaultPort = 3030

// main initializes services, starts the HTTP server, and waits for a shutdown signal.
func main() {
	// Initialize logger
	logger := utils.NewLogger()
	defer logger.Close()

	// Ensure kiroui directory exists
	homeDir, _ := os.UserHomeDir()
	os.MkdirAll(filepath.Join(homeDir, ".kiro", "kiroui"), 0755)

	// Initialize services
	kiroService := system.NewKiroService(logger, Version)
	
	systemHandler := system.NewHandler(kiroService)
	mcpService := mcp.NewMCPService(kiroService, logger)
	
	mcpHandler := mcp.NewHandler(mcpService)
	agentService := agent.NewAgentService(kiroService)
	agentHandler := agent.NewHandler(agentService)
	fileService := file.NewFileService(logger)
	fileHandler := file.NewHandler(fileService)
	fileExplorerService := fileexplorer.NewFileExplorerService(logger)
	fileExplorerHandler := fileexplorer.NewHandler(fileExplorerService)
	dashboardService := dashboard.NewDashboardService(kiroService, mcpService, agentService, logger)
	dashboardHandler := dashboard.NewHandler(dashboardService)
	steeringService := steering.NewService(kiroService, logger)
	steeringHandler := steering.NewHandler(steeringService)
	skillsService := skills.NewService(kiroService, logger)
	skillsHandler := skills.NewHandler(skillsService)
	launcherService := launcher.NewService(logger, kiroService.IsWSL())
	launcherHandler := launcher.NewHandler(launcherService)
	changelogService := changelog.NewService(logger, kiroService)
	changelogHandler := changelog.NewHandler(changelogService)

	// Generate auth token
	authToken := generateToken()

	// Setup router
	router := setupRouter(systemHandler, mcpHandler, agentHandler, fileHandler, fileExplorerHandler, dashboardHandler, steeringHandler, skillsHandler, launcherHandler, changelogHandler, logger, authToken)

	// Find available port
	port := findAvailablePort(defaultPort)
	serverURL := fmt.Sprintf("http://127.0.0.1:%d", port)

	// Create server
	server := &http.Server{
		Addr:         fmt.Sprintf("127.0.0.1:%d", port),
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in goroutine
	go func() {
		logger.Info("🚀 KiroManager server running on %s", serverURL)

		// Open browser unless --no-browser flag
		if !hasFlag("--no-browser") {
			go func() {
				time.Sleep(500 * time.Millisecond)
				if err := open.Run(serverURL); err != nil {
					logger.Warn("Failed to open browser: %v", err)
					logger.Info("Open browser manually at %s", serverURL)
				}
			}()
		}

		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("Failed to start server: %v", err)
			os.Exit(1)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down server...")

	// Graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logger.Error("Server forced to shutdown: %v", err)
	}

	logger.Info("Server exited")
}

// setupRouter configures the mux router with all API routes, middleware, and static file serving.
func setupRouter(systemHandler *system.Handler, mcpHandler *mcp.Handler, agentHandler *agent.Handler, fileHandler *file.Handler, fileExplorerHandler *fileexplorer.Handler, dashboardHandler *dashboard.Handler, steeringHandler *steering.Handler, skillsHandler *skills.Handler, launcherHandler *launcher.Handler, changelogHandler *changelog.Handler, logger *utils.Logger, authToken string) *mux.Router {
	router := mux.NewRouter()

	// Security middleware for API routes only
	api := router.PathPrefix("/api").Subrouter()
	api.Use(securityMiddleware())
	api.Use(authMiddleware(authToken))
	api.Use(loggingMiddleware(logger))

	// System routes
	api.HandleFunc("/system/info", systemHandler.GetSystemInfo).Methods("GET")
	api.HandleFunc("/system/status", systemHandler.GetKiroStatus).Methods("GET")
	api.HandleFunc("/system/models", systemHandler.GetKiroModels).Methods("GET")
	api.HandleFunc("/system/version", systemHandler.CheckForUpdate).Methods("GET")

	// Workspace routes
	api.HandleFunc("/workspace/context", systemHandler.GetWorkspaceContext).Methods("GET")
	api.HandleFunc("/workspace/context", systemHandler.SetWorkspaceContext).Methods("POST")
	api.HandleFunc("/workspace/add", systemHandler.AddWorkspace).Methods("POST")
	api.HandleFunc("/workspace/add-existing", systemHandler.AddExistingWorkspace).Methods("POST")
	api.HandleFunc("/workspace/remove", systemHandler.RemoveWorkspace).Methods("POST")
	api.HandleFunc("/workspace/list", systemHandler.ListWorkspaces).Methods("GET")
	api.HandleFunc("/workspace/delete", systemHandler.DeleteWorkspace).Methods("POST")
	api.HandleFunc("/workspace/copy", systemHandler.CopyWorkspace).Methods("POST")
	api.HandleFunc("/workspace/move", systemHandler.MoveWorkspace).Methods("POST")

	// Dashboard routes
	api.HandleFunc("/dashboard/setup-status", dashboardHandler.GetSetupStatus).Methods("GET")
	api.HandleFunc("/dashboard/setup-action", dashboardHandler.PerformSetupAction).Methods("POST")
	api.HandleFunc("/dashboard/mcp-profiles", dashboardHandler.GetMCPProfiles).Methods("GET")
	api.HandleFunc("/dashboard/agents", dashboardHandler.GetAgents).Methods("GET")
	api.HandleFunc("/dashboard/counts", dashboardHandler.GetDashboardCounts).Methods("GET")

	// Kiro routes
	api.HandleFunc("/kiro/status", systemHandler.GetKiroStatus).Methods("GET")

	// MCP routes (specific routes before parameterized)
	api.HandleFunc("/mcp/servers", mcpHandler.GetMCPServers).Methods("GET")
	api.HandleFunc("/mcp/servers", mcpHandler.CreateMCPServer).Methods("POST")
	api.HandleFunc("/mcp/servers/{id}", mcpHandler.UpdateMCPServer).Methods("PUT")
	api.HandleFunc("/mcp/config", mcpHandler.GetMCPConfig).Methods("GET")
	api.HandleFunc("/mcp/config", mcpHandler.SaveMCPConfig).Methods("POST")
	api.HandleFunc("/mcp/save", mcpHandler.SaveMCPConfig).Methods("POST")
	api.HandleFunc("/mcp/deploy", mcpHandler.DeployMCP).Methods("POST")
	api.HandleFunc("/mcp/tools", mcpHandler.GetAllMCPTools).Methods("GET")
	api.HandleFunc("/mcp/tools/agent", mcpHandler.GetAgentMCPTools).Methods("POST")
	api.HandleFunc("/mcp/tools/{serverName}", mcpHandler.GetMCPServerTools).Methods("GET")
	api.HandleFunc("/mcp/tools/{serverName}/{toolName}", mcpHandler.CallMCPTool).Methods("POST")

	// Agent routes (specific routes before parameterized)
	api.HandleFunc("/agents/config", agentHandler.GetAgentConfig).Methods("GET")
	api.HandleFunc("/agents/config", agentHandler.SaveAgentConfig).Methods("POST")
	api.HandleFunc("/agents/all-names", agentHandler.GetAllAgentNames).Methods("GET")
	api.HandleFunc("/agents", agentHandler.GetAgents).Methods("GET")
	api.HandleFunc("/agents", agentHandler.CreateAgent).Methods("POST")
	api.HandleFunc("/agents/{name}", agentHandler.GetAgent).Methods("GET")
	api.HandleFunc("/agents/{name}", agentHandler.UpdateAgent).Methods("PUT")
	api.HandleFunc("/agents/{name}", agentHandler.DeleteAgent).Methods("DELETE")

	// File routes
	api.HandleFunc("/files/browse", fileHandler.BrowseFiles).Methods("GET")
	api.HandleFunc("/files/generate-uri", fileHandler.GenerateFileURI).Methods("POST")
	api.HandleFunc("/files/upload", fileHandler.UploadFiles).Methods("POST")

	// Launcher routes
	api.HandleFunc("/launcher/launch", launcherHandler.Launch).Methods("POST")

	// Changelog routes
	api.HandleFunc("/changelog", changelogHandler.GetChangelog).Methods("GET")

	// Steering routes
	api.HandleFunc("/steering/files", steeringHandler.GetFiles).Methods("GET")
	api.HandleFunc("/steering/content", steeringHandler.GetFileContent).Methods("GET")
	api.HandleFunc("/steering/file", steeringHandler.SaveFile).Methods("POST")
	api.HandleFunc("/steering/file", steeringHandler.DeleteFile).Methods("DELETE")

	// Skills routes
	api.HandleFunc("/skills/deactivate", skillsHandler.Deactivate).Methods("POST")

	// File explorer routes
	api.HandleFunc("/fileexplorer/browse", fileExplorerHandler.Browse).Methods("GET")
	api.HandleFunc("/fileexplorer/read", fileExplorerHandler.ReadFile).Methods("GET")
	api.HandleFunc("/fileexplorer/folder", fileExplorerHandler.CreateFolder).Methods("POST")
	api.HandleFunc("/fileexplorer/file", fileExplorerHandler.CreateFile).Methods("POST")
	api.HandleFunc("/fileexplorer/cut", fileExplorerHandler.Cut).Methods("POST")
	api.HandleFunc("/fileexplorer/copy", fileExplorerHandler.Copy).Methods("POST")
	api.HandleFunc("/fileexplorer/rename", fileExplorerHandler.Rename).Methods("POST")
	api.HandleFunc("/fileexplorer/delete", fileExplorerHandler.Delete).Methods("DELETE")
	api.HandleFunc("/fileexplorer/bulk-copy", fileExplorerHandler.BulkCopy).Methods("POST")
	api.HandleFunc("/fileexplorer/bulk-cut", fileExplorerHandler.BulkCut).Methods("POST")
	api.HandleFunc("/fileexplorer/bulk-delete", fileExplorerHandler.BulkDelete).Methods("POST")
	api.HandleFunc("/fileexplorer/check-conflicts", fileExplorerHandler.CheckConflicts).Methods("POST")
	api.HandleFunc("/fileexplorer/unique-name", fileExplorerHandler.GenerateUniqueName).Methods("GET")

	// Serve static files
	webFS, _ := fs.Sub(webFiles, "web/dist")
	router.PathPrefix("/assets/").Handler(http.FileServer(http.FS(webFS)))
	router.PathPrefix("/static/").Handler(http.FileServer(http.FS(webFS)))

	// Catch-all: serve index.html for all other GET requests (React Router)
	router.PathPrefix("/").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		indexFile, err := webFS.Open("index.html")
		if err != nil {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		defer indexFile.Close()

		content, _ := io.ReadAll(indexFile)
		// Inject auth token into the page before React loads
		tokenScript := fmt.Sprintf(`<script>window.__CCKIRO_TOKEN__="%s";</script>`, authToken)
		modified := strings.Replace(string(content), "<head>", "<head>"+tokenScript, 1)

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(modified))
	}).Methods("GET")

	return router
}

// findAvailablePort scans up to 100 ports starting from startPort and returns the first available one.
func findAvailablePort(startPort int) int {
	for port := startPort; port < startPort+100; port++ {
		if isPortAvailable(port) {
			return port
		}
	}
	return startPort
}

// isPortAvailable reports whether the given TCP port is free to bind.
func isPortAvailable(port int) bool {
	addr := fmt.Sprintf(":%d", port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return false
	}
	listener.Close()
	return true
}

// hasFlag reports whether the given flag is present in the command-line arguments.
func hasFlag(flag string) bool {
	for _, arg := range os.Args[1:] {
		if arg == flag {
			return true
		}
	}
	return false
}

// generateToken creates a cryptographically random hex token.
func generateToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// authMiddleware returns middleware that validates the Bearer token on all API requests.
// OPTIONS requests are skipped to allow CORS preflight.
func authMiddleware(token string) mux.MiddlewareFunc {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == "OPTIONS" {
				next.ServeHTTP(w, r)
				return
			}
			auth := r.Header.Get("Authorization")
			if auth != "Bearer "+token {
				http.Error(w, `{"error":"unauthorized","code":"UNAUTHORIZED"}`, http.StatusUnauthorized)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// securityMiddleware returns middleware that sets CORS and security headers on API responses.
func securityMiddleware() mux.MiddlewareFunc {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			allowedOrigins := map[string]bool{
				"http://localhost:3030":  true,
				"http://127.0.0.1:3030": true,
			}
			if allowedOrigins[origin] {
				w.Header().Set("Access-Control-Allow-Origin", origin)
			}

			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.Header().Set("X-Frame-Options", "DENY")
			w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
			w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; media-src 'self'; frame-src 'none'")

			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// loggingMiddleware returns middleware that logs each request's method, path, status, and duration.
func loggingMiddleware(logger *utils.Logger) mux.MiddlewareFunc {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()

			wrapped := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}

			next.ServeHTTP(wrapped, r)

			duration := time.Since(start)
			logger.Info("%s %s %d %v", r.Method, r.URL.Path, wrapped.statusCode, duration)
		})
	}
}

// responseWriter wraps http.ResponseWriter to capture the status code for logging.
type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

// WriteHeader captures the status code and delegates to the underlying ResponseWriter.
func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

