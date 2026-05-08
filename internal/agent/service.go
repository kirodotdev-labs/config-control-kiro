// Package agent provides CRUD operations for Kiro agent configurations
// stored as JSON files within the .kiro/agents directory.
package agent

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"kiromanager/internal/models"
	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

// AgentService manages agent configuration files on disk,
// supporting both global and workspace-scoped agents.
type AgentService struct {
	kiroService *system.KiroService
}

// NewAgentService creates an AgentService and ensures the agents
// directory exists under the active config path.
func NewAgentService(kiroService *system.KiroService) *AgentService {
	// Ensure agents directory exists
	agentsDir := filepath.Join(kiroService.GetConfigPath(), "agents")
	os.MkdirAll(agentsDir, 0755)
	return &AgentService{
		kiroService: kiroService,
	}
}

// getAgentsDir returns the current agents directory based on active context
func (s *AgentService) getAgentsDir() string {
	return filepath.Join(s.kiroService.GetConfigPath(), "agents")
}

// GetAllAgents reads every agent JSON file in the agents directory
// and returns them as a slice.
func (s *AgentService) GetAllAgents() ([]models.Agent, error) {
	var agents []models.Agent

	err := filepath.WalkDir(s.getAgentsDir(), func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(path, ".json") {
			return err
		}

		agent, err := s.loadAgentFromFile(path)
		if err == nil {
			agents = append(agents, agent)
		}
		return nil
	})

	return agents, err
}

// GetAgent loads a single agent by its ID (filename without extension).
func (s *AgentService) GetAgent(id string) (*models.Agent, error) {
	filePath := filepath.Join(s.getAgentsDir(), id+".json")
	agent, err := s.loadAgentFromFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("agent not found: %s", id)
	}
	return &agent, nil
}

// CreateAgent persists a new agent to disk. It returns an error if the
// name is empty or an agent with the same name already exists.
func (s *AgentService) CreateAgent(agent *models.Agent) error {
	if agent.Name == "" {
		return utils.NewAppError("Agent name is required", 400, "INVALID_AGENT")
	}

	// Check if agent already exists
	filePath := filepath.Join(s.getAgentsDir(), agent.Name+".json")
	if _, err := os.Stat(filePath); err == nil {
		return utils.NewAppError(
			fmt.Sprintf("Agent '%s' already exists. Go to the Agents page, edit that agent's name, and try again.", agent.Name),
			409,
			"DUPLICATE_AGENT",
		)
	}

	return s.saveAgentToFile(agent)
}

// UpdateAgent overwrites an existing agent's JSON file with the provided data.
func (s *AgentService) UpdateAgent(name string, agent *models.Agent) error {
	_, err := s.GetAgent(name)
	if err != nil {
		return err
	}

	return s.saveAgentToFile(agent)
}

// DeleteAgent removes the agent's JSON file from disk.
func (s *AgentService) DeleteAgent(name string) error {
	filePath := filepath.Join(s.getAgentsDir(), name+".json")
	return os.Remove(filePath)
}

func (s *AgentService) loadAgentFromFile(filePath string) (models.Agent, error) {
	var agent models.Agent
	data, err := os.ReadFile(filePath)
	if err != nil {
		return agent, err
	}
	err = json.Unmarshal(data, &agent)
	return agent, err
}

func (s *AgentService) saveAgentToFile(agent *models.Agent) error {
	if agent.Name == "" {
		return fmt.Errorf("agent name cannot be empty")
	}
	filePath := filepath.Join(s.getAgentsDir(), agent.Name+".json")
	data, err := json.MarshalIndent(agent, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filePath, data, 0644)
}

// GetAllAgentNames returns deduplicated agent names from both the active
// context and the global config directory.
func (s *AgentService) GetAllAgentNames() []string {
	seen := map[string]bool{}
	var names []string

	// Read from active context
	s.collectAgentNames(s.getAgentsDir(), seen, &names)

	// Also read from global if active context is different
	globalDir := filepath.Join(s.kiroService.GetGlobalConfigPath(), "agents")
	if globalDir != s.getAgentsDir() {
		s.collectAgentNames(globalDir, seen, &names)
	}

	return names
}

func (s *AgentService) collectAgentNames(dir string, seen map[string]bool, names *[]string) {
	filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(path, ".json") {
			return err
		}
		name := strings.TrimSuffix(d.Name(), ".json")
		if name != "" && !seen[name] {
			seen[name] = true
			*names = append(*names, name)
		}
		return nil
	})
}


