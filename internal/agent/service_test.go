package agent

import (
	"os"
	"path/filepath"
	"testing"

	"kiromanager/internal/models"
	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

func setupTestService(t *testing.T) (*AgentService, string) {
	t.Helper()
	dir := t.TempDir()
	logger := utils.NewLogger()
	kiroSvc := system.NewKiroService(logger, "test")
	kiroSvc.SetWorkspace(dir)
	os.MkdirAll(filepath.Join(dir, ".kiro", "agents"), 0755)
	return NewAgentService(kiroSvc, logger), dir
}

func TestCreateAgent(t *testing.T) {
	svc, _ := setupTestService(t)
	agent := &models.Agent{Name: "test-agent", Description: "A test agent"}

	if err := svc.CreateAgent(agent); err != nil {
		t.Fatalf("create failed: %v", err)
	}

	got, err := svc.GetAgent("test-agent")
	if err != nil {
		t.Fatalf("get failed: %v", err)
	}
	if got.Name != "test-agent" {
		t.Errorf("expected 'test-agent', got %q", got.Name)
	}
}

func TestCreateAgent_EmptyName(t *testing.T) {
	svc, _ := setupTestService(t)
	err := svc.CreateAgent(&models.Agent{})
	if err == nil {
		t.Error("expected error for empty name")
	}
}

func TestCreateAgent_Duplicate(t *testing.T) {
	svc, _ := setupTestService(t)
	svc.CreateAgent(&models.Agent{Name: "dup"})
	err := svc.CreateAgent(&models.Agent{Name: "dup"})
	if err == nil {
		t.Error("expected error for duplicate agent")
	}
}

func TestGetAllAgents(t *testing.T) {
	svc, _ := setupTestService(t)
	svc.CreateAgent(&models.Agent{Name: "a"})
	svc.CreateAgent(&models.Agent{Name: "b"})

	agents, err := svc.GetAllAgents()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(agents) != 2 {
		t.Errorf("expected 2 agents, got %d", len(agents))
	}
}

func TestDeleteAgent(t *testing.T) {
	svc, _ := setupTestService(t)
	svc.CreateAgent(&models.Agent{Name: "to-delete"})

	if err := svc.DeleteAgent("to-delete"); err != nil {
		t.Fatalf("delete failed: %v", err)
	}

	_, err := svc.GetAgent("to-delete")
	if err == nil {
		t.Error("expected error after delete")
	}
}

func TestUpdateAgent(t *testing.T) {
	svc, _ := setupTestService(t)
	svc.CreateAgent(&models.Agent{Name: "update-me", Description: "old"})

	err := svc.UpdateAgent("update-me", &models.Agent{Name: "update-me", Description: "new"})
	if err != nil {
		t.Fatalf("update failed: %v", err)
	}

	got, _ := svc.GetAgent("update-me")
	if got.Description != "new" {
		t.Errorf("expected 'new', got %q", got.Description)
	}
}

func TestGetAgent_NotFound(t *testing.T) {
	svc, _ := setupTestService(t)
	_, err := svc.GetAgent("nonexistent")
	if err == nil {
		t.Error("expected error for nonexistent agent")
	}
}

func TestGetAllAgentNames(t *testing.T) {
	svc, _ := setupTestService(t)
	svc.CreateAgent(&models.Agent{Name: "alpha"})
	svc.CreateAgent(&models.Agent{Name: "beta"})

	names := svc.GetAllAgentNames()
	if len(names) < 2 {
		t.Errorf("expected at least 2 names, got %d", len(names))
	}
}

func TestMixedTypeResources_Roundtrip(t *testing.T) {
	svc, dir := setupTestService(t)

	// Write agent JSON with mixed-type resources directly to disk
	agentJSON := `{
		"name": "mixed-resources",
		"resources": [
			"file:///path/to/file.md",
			{
				"include": ["**/*.md"],
				"indexType": "best",
				"autoUpdate": true,
				"name": "my-kb",
				"type": "knowledgeBase",
				"source": "file:///path/to/dir"
			},
			"file:///another/file.md"
		],
		"tools": ["read", "write", "*"],
		"allowedTools": ["read", "shell"]
	}`
	agentPath := filepath.Join(dir, ".kiro", "agents", "mixed-resources.json")
	if err := os.WriteFile(agentPath, []byte(agentJSON), 0644); err != nil {
		t.Fatalf("failed to write test agent: %v", err)
	}

	// Load all agents — should NOT fail
	agents, err := svc.GetAllAgents()
	if err != nil {
		t.Fatalf("GetAllAgents failed: %v", err)
	}
	if len(agents) != 1 {
		t.Fatalf("expected 1 agent, got %d", len(agents))
	}

	agent := agents[0]
	if agent.Name != "mixed-resources" {
		t.Errorf("expected name 'mixed-resources', got %q", agent.Name)
	}
	if len(agent.Resources) != 3 {
		t.Errorf("expected 3 resources, got %d", len(agent.Resources))
	}
	if len(agent.Tools) != 3 {
		t.Errorf("expected 3 tools, got %d", len(agent.Tools))
	}
	if len(agent.AllowedTools) != 2 {
		t.Errorf("expected 2 allowedTools, got %d", len(agent.AllowedTools))
	}

	// Verify string resource
	if r, ok := agent.Resources[0].(string); !ok || r != "file:///path/to/file.md" {
		t.Errorf("expected first resource to be string URI, got %v", agent.Resources[0])
	}

	// Verify object resource
	if obj, ok := agent.Resources[1].(map[string]interface{}); !ok {
		t.Errorf("expected second resource to be object, got %T", agent.Resources[1])
	} else if obj["type"] != "knowledgeBase" {
		t.Errorf("expected type 'knowledgeBase', got %v", obj["type"])
	}

	// Save and reload — verify roundtrip
	if err := svc.UpdateAgent("mixed-resources", &agent); err != nil {
		t.Fatalf("UpdateAgent failed: %v", err)
	}
	reloaded, err := svc.GetAgent("mixed-resources")
	if err != nil {
		t.Fatalf("GetAgent after save failed: %v", err)
	}
	if len(reloaded.Resources) != 3 {
		t.Errorf("roundtrip: expected 3 resources, got %d", len(reloaded.Resources))
	}
}