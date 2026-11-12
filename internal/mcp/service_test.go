package mcp

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kiromanager/internal/shared/ordered"
	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

func setupTestService(t *testing.T) (*MCPService, *system.KiroService, string) {
	t.Helper()
	dir := t.TempDir()
	t.Setenv("KIRO_HOME", t.TempDir()) // never write the real ~/.kiro
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

func TestGetMCPConfig(t *testing.T) {
	t.Run("missing file yields empty config", func(t *testing.T) {
		svc, _, _ := setupTestService(t)
		doc, err := svc.GetMCPConfig()
		if err != nil || doc.Exists || !doc.Config.Has("mcpServers") {
			t.Fatalf("doc %+v err %v", doc, err)
		}
	})
	t.Run("invalid JSON is an error, never an empty config", func(t *testing.T) {
		svc, _, dir := setupTestService(t)
		writeTestMCPConfig(t, dir, `{"mcpServers": {`)
		if _, err := svc.GetMCPConfig(); err == nil {
			t.Fatal("expected error for unparseable mcp.json")
		}
	})
}

func TestSaveMCPConfigKeepsKeyOrder(t *testing.T) {
	svc, _, dir := setupTestService(t)
	if _, err := svc.SaveMCPConfig(nil); err == nil {
		t.Error("nil config should be rejected")
	}
	in := `{"zeta":1,"mcpServers":{"b":{"command":"x"},"a":{"command":"y"}}}`
	cfg := ordered.New()
	if err := cfg.UnmarshalJSON([]byte(in)); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SaveMCPConfig(cfg); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(filepath.Join(dir, ".kiro", "settings", "mcp.json"))
	text := string(data)
	if strings.Index(text, "zeta") > strings.Index(text, "mcpServers") || strings.Index(text, `"b"`) > strings.Index(text, `"a"`) {
		t.Errorf("key order not preserved:\n%s", text)
	}
	doc, err := svc.GetMCPConfig()
	if err != nil || !doc.Exists {
		t.Fatalf("reload: %+v %v", doc, err)
	}
}
