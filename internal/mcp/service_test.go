package mcp

import (
	"os"
	"path/filepath"
	"testing"

	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

func setupTestService(t *testing.T) (*MCPService, *system.KiroService, string) {
	t.Helper()
	dir := t.TempDir()
	logger := utils.NewLogger()
	kiroSvc := system.NewKiroService(logger, "test")
	kiroSvc.SetWorkspace(dir)
	os.MkdirAll(filepath.Join(dir, ".kiro", "settings"), 0755)
	return NewMCPService(kiroSvc, logger), kiroSvc, dir
}

func writeTestMCPConfig(t *testing.T, dir string, config string) {
	t.Helper()
	path := filepath.Join(dir, ".kiro", "settings", "mcp.json")
	os.WriteFile(path, []byte(config), 0644)
}

func TestGetAllMCPServers_Empty(t *testing.T) {
	svc, _, _ := setupTestService(t)
	servers, err := svc.GetAllMCPServers()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(servers) != 0 {
		t.Errorf("expected 0 servers, got %d", len(servers))
	}
}

func TestGetAllMCPServers_WithServers(t *testing.T) {
	svc, _, dir := setupTestService(t)
	writeTestMCPConfig(t, dir, `{
		"mcpServers": {
			"server-a": {"command": "node", "args": ["index.js"]},
			"server-b": {"url": "http://localhost:8080"}
		}
	}`)

	servers, err := svc.GetAllMCPServers()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(servers) != 2 {
		t.Errorf("expected 2 servers, got %d", len(servers))
	}

	// Should be sorted alphabetically
	if servers[0].Name != "server-a" {
		t.Errorf("expected first server 'server-a', got %q", servers[0].Name)
	}
	if servers[0].Type != "local" {
		t.Errorf("expected type 'local', got %q", servers[0].Type)
	}
	if servers[1].Type != "remote" {
		t.Errorf("expected type 'remote', got %q", servers[1].Type)
	}
}

func TestGetMCPConfig(t *testing.T) {
	svc, _, dir := setupTestService(t)
	writeTestMCPConfig(t, dir, `{"mcpServers": {"test": {"command": "echo"}}}`)

	config, err := svc.GetMCPConfig()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if config["mcpServers"] == nil {
		t.Error("expected mcpServers in config")
	}
}

func TestSaveMCPConfig(t *testing.T) {
	svc, _, dir := setupTestService(t)
	config := map[string]interface{}{
		"mcpServers": map[string]interface{}{
			"new-server": map[string]interface{}{
				"command": "python",
				"args":    []string{"-m", "server"},
			},
		},
	}

	result, err := svc.SaveMCPConfig(config)
	if err != nil {
		t.Fatalf("save failed: %v", err)
	}
	if result["success"] != true {
		t.Error("expected success=true")
	}

	// Verify file was written
	path := filepath.Join(dir, ".kiro", "settings", "mcp.json")
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Error("config file not created")
	}
}

func TestUpdateMCPServer(t *testing.T) {
	svc, _, dir := setupTestService(t)
	writeTestMCPConfig(t, dir, `{"mcpServers": {"test": {"command": "echo"}}}`)

	server, err := svc.UpdateMCPServer("test", map[string]interface{}{"enabled": false})
	if err != nil {
		t.Fatalf("update failed: %v", err)
	}
	if server == nil {
		t.Fatal("expected server, got nil")
	}
	if server.Enabled {
		t.Error("expected server to be disabled")
	}
}

func TestUpdateMCPServer_NotFound(t *testing.T) {
	svc, _, dir := setupTestService(t)
	writeTestMCPConfig(t, dir, `{"mcpServers": {}}`)

	_, err := svc.UpdateMCPServer("nonexistent", map[string]interface{}{})
	if err == nil {
		t.Error("expected error for nonexistent server")
	}
}

func TestDeployMCP_NotFound(t *testing.T) {
	svc, _, dir := setupTestService(t)
	writeTestMCPConfig(t, dir, `{"mcpServers": {}}`)

	_, err := svc.DeployMCP("nonexistent")
	if err == nil {
		t.Error("expected error for nonexistent server")
	}
}
