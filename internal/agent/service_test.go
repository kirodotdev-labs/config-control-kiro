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
	return NewAgentService(kiroSvc), dir
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
