package dashboard

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"kiromanager/internal/agent"
	"kiromanager/internal/mcp"
	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

// DashboardService aggregates setup status, feature checks, and counts
// across agents, MCP servers, steering files, and skills.
type DashboardService struct {
	kiroService  *system.KiroService
	mcpService   *mcp.MCPService
	agentService *agent.AgentService
	logger       *utils.Logger
}

// NewDashboardService creates a new DashboardService with the given dependencies.
func NewDashboardService(kiroService *system.KiroService, mcpService *mcp.MCPService, agentService *agent.AgentService, logger *utils.Logger) *DashboardService {
	return &DashboardService{
		kiroService:  kiroService,
		mcpService:   mcpService,
		agentService: agentService,
		logger:       logger,
	}
}

// SetupStatus tracks which Kiro features have been configured.
type SetupStatus struct {
	// Agent features
	HasAgents            bool `json:"hasAgents"`
	AgentHasDescription  bool `json:"agentHasDescription"`
	AgentHasPrompt       bool `json:"agentHasPrompt"`
	AgentHasModel        bool `json:"agentHasModel"`
	AgentHasTools        bool `json:"agentHasTools"`
	AgentHasAllowedTools bool `json:"agentHasAllowedTools"`
	AgentHasToolAliases  bool `json:"agentHasToolAliases"`
	AgentHasToolsSettings bool `json:"agentHasToolsSettings"`
	AgentHasSubagents    bool `json:"agentHasSubagents"`
	AgentHasWelcomeMsg   bool `json:"agentHasWelcomeMsg"`
	AgentHasShortcut     bool `json:"agentHasShortcut"`

	// MCP features
	HasMcpServers        bool `json:"hasMcpServers"`
	HasEnabledMcp        bool `json:"hasEnabledMcp"`
	AgentHasIncludeMcp   bool `json:"agentHasIncludeMcp"`

	// Resources features
	AgentHasResources    bool `json:"agentHasResources"`
	AgentHasSteering     bool `json:"agentHasSteering"`
	AgentHasSkillRes     bool `json:"agentHasSkillRes"`

	// Hooks features
	AgentHasHooks        bool `json:"agentHasHooks"`

	// Steering features
	HasSteeringFiles     bool `json:"hasSteeringFiles"`

	// Skills features
	HasSkills            bool `json:"hasSkills"`

	// Workspace features
	HasWorkspaces        bool `json:"hasWorkspaces"`
}

// SetupStatusResponse wraps the setup checklist with progress and counts.
type SetupStatusResponse struct {
	Setup    SetupStatus `json:"setup"`
	Progress Progress    `json:"progress"`
	Counts   Counts      `json:"counts"`
}

// Progress tracks how many setup checks have been completed.
type Progress struct {
	Completed  int `json:"completed"`
	Total      int `json:"total"`
	Percentage int `json:"percentage"`
}

// Counts holds numeric totals for various Kiro resources.
type Counts struct {
	McpServers     int  `json:"mcpServers"`
	Agents         int  `json:"agents"`
	Workspaces     int  `json:"workspaces"`
	TotalTools     int  `json:"totalTools"`
	TotalHooks     int  `json:"totalHooks"`
	TotalResources int  `json:"totalResources"`
	SteeringFiles  int  `json:"steeringFiles"`
	SkillFolders   int  `json:"skillFolders"`
}

// GetSetupStatus evaluates all setup checks and returns the current status,
// progress percentage, and resource counts.
func (s *DashboardService) GetSetupStatus() (*SetupStatusResponse, error) {

	// Get agents for feature checks
	agents, _ := s.agentService.GetAllAgents()

	// Get MCP servers for feature checks
	mcpServers, _ := s.mcpService.GetAllMCPServers()

	// Check agent features (any agent has X)
	hasAgents := len(agents) > 0
	agentHasDescription := false
	agentHasPrompt := false
	agentHasModel := false
	agentHasTools := false
	agentHasAllowedTools := false
	agentHasToolAliases := false
	agentHasToolsSettings := false
	agentHasSubagents := false
	agentHasWelcomeMsg := false
	agentHasShortcut := false
	agentHasIncludeMcp := false
	agentHasResources := false
	agentHasSteering := false
	agentHasSkillRes := false
	agentHasHooks := false

	for _, agent := range agents {
		if agent.Description != "" { agentHasDescription = true }
		if agent.Prompt != "" { agentHasPrompt = true }
		if agent.Model != "" { agentHasModel = true }
		if len(agent.Tools) > 0 { agentHasTools = true }
		if len(agent.AllowedTools) > 0 { agentHasAllowedTools = true }
		if agent.ToolAliases != nil { agentHasToolAliases = true }
		if agent.ToolsSettings != nil { agentHasToolsSettings = true }
		if agent.WelcomeMessage != "" { agentHasWelcomeMsg = true }
		if agent.KeyboardShortcut != "" { agentHasShortcut = true }
		if agent.IncludeMcpJson != nil { agentHasIncludeMcp = true }
		if agent.Hooks != nil { agentHasHooks = true }

		// Check toolsSettings for subagent config
		if ts, ok := agent.ToolsSettings.(map[string]interface{}); ok {
			if _, has := ts["subagent"]; has { agentHasSubagents = true }
		}

		// Check resources for file://, steering, skill://
		for _, r := range agent.Resources {
			agentHasResources = true
			if strings.Contains(r, "steering") { agentHasSteering = true }
			if strings.HasPrefix(r, "skill://") { agentHasSkillRes = true }
		}
	}

	// Check MCP features
	hasMcpServers := len(mcpServers) > 0
	hasEnabledMcp := false
	for _, server := range mcpServers {
		if server.Enabled {
			hasEnabledMcp = true
			break
		}
	}

	// Check steering features
	steeringPath := filepath.Join(s.kiroService.GetConfigPath(), "steering")
	hasSteeringFiles := false
	if files, err := filepath.Glob(filepath.Join(steeringPath, "*.md")); err == nil && len(files) > 0 {
		hasSteeringFiles = true
	}

	// Check skills features
	skillsPath := filepath.Join(s.kiroService.GetConfigPath(), "skills")
	hasSkills := false
	if entries, err := os.ReadDir(skillsPath); err == nil {
		for _, entry := range entries {
			if entry.IsDir() {
				hasSkills = true
				break
			}
		}
	}

	status := SetupStatus{
		HasAgents:            hasAgents,
		AgentHasDescription:  agentHasDescription,
		AgentHasPrompt:       agentHasPrompt,
		AgentHasModel:        agentHasModel,
		AgentHasTools:        agentHasTools,
		AgentHasAllowedTools: agentHasAllowedTools,
		AgentHasToolAliases:  agentHasToolAliases,
		AgentHasToolsSettings: agentHasToolsSettings,
		AgentHasSubagents:    agentHasSubagents,
		AgentHasWelcomeMsg:   agentHasWelcomeMsg,
		AgentHasShortcut:     agentHasShortcut,
		HasMcpServers:        hasMcpServers,
		HasEnabledMcp:        hasEnabledMcp,
		AgentHasIncludeMcp:   agentHasIncludeMcp,
		AgentHasResources:    agentHasResources,
		AgentHasSteering:     agentHasSteering,
		AgentHasSkillRes:     agentHasSkillRes,
		AgentHasHooks:        agentHasHooks,
		HasSteeringFiles:     hasSteeringFiles,
		HasSkills:            hasSkills,
		HasWorkspaces:        len(s.kiroService.GetWorkspaces()) > 0,
	}

	// Calculate progress dynamically from all setup checks
	checks := []bool{
		status.HasAgents,
		status.AgentHasDescription,
		status.AgentHasPrompt,
		status.AgentHasModel,
		status.AgentHasTools,
		status.AgentHasAllowedTools,
		status.AgentHasToolAliases,
		status.AgentHasToolsSettings,
		status.AgentHasSubagents,
		status.AgentHasWelcomeMsg,
		status.AgentHasShortcut,
		status.HasMcpServers,
		status.HasEnabledMcp,
		status.AgentHasIncludeMcp,
		status.AgentHasResources,
		status.AgentHasSteering,
		status.AgentHasSkillRes,
		status.AgentHasHooks,
		status.HasSteeringFiles,
		status.HasSkills,
		status.HasWorkspaces,
	}

	completed := 0
	for _, check := range checks {
		if check {
			completed++
		}
	}
	total := len(checks)

	percentage := (completed * 100) / total

	progress := Progress{
		Completed:  completed,
		Total:      total,
		Percentage: percentage,
	}

	// Get counts
	counts := s.getCounts()

	return &SetupStatusResponse{
		Setup:    status,
		Progress: progress,
		Counts:   counts,
	}, nil
}

// checkPath reports whether the given path exists on disk.
func (s *DashboardService) checkPath(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// getCounts returns resource counts for the active config path.
func (s *DashboardService) getCounts() Counts {
	return s.getCountsForPath(s.kiroService.GetConfigPath())
}

// getCountsForPath returns resource counts for a specific .kiro path.
func (s *DashboardService) getCountsForPath(kiroPath string) Counts {
	// Get agents from the specified path
	agentsPath := filepath.Join(kiroPath, "agents")
	agentCount := 0
	totalTools := 0
	totalHooks := 0
	totalResources := 0

	if entries, err := os.ReadDir(agentsPath); err == nil {
		for _, entry := range entries {
			if !entry.IsDir() && filepath.Ext(entry.Name()) == ".json" {
				agentCount++
				// Read agent for tool/hook/resource counts
				var agent map[string]interface{}
				if data, err := os.ReadFile(filepath.Join(agentsPath, entry.Name())); err == nil {
					if err := json.Unmarshal(data, &agent); err == nil {
						if tools, ok := agent["tools"].([]interface{}); ok {
							totalTools += len(tools)
						}
						if resources, ok := agent["resources"].([]interface{}); ok {
							totalResources += len(resources)
						}
						if hooks, ok := agent["hooks"].(map[string]interface{}); ok {
							totalHooks += len(hooks)
						}
					}
				}
			}
		}
	}

	// Count MCP servers from the specified path
	mcpCount := 0
	mcpConfigPath := filepath.Join(kiroPath, "settings", "mcp.json")
	if data, err := os.ReadFile(mcpConfigPath); err == nil {
		var config map[string]interface{}
		if err := json.Unmarshal(data, &config); err == nil {
			if servers, ok := config["mcpServers"].(map[string]interface{}); ok {
				mcpCount = len(servers)
			}
		}
	}

	// Count steering files
	steeringPath := filepath.Join(kiroPath, "steering")
	steeringFiles := 0
	if files, err := filepath.Glob(filepath.Join(steeringPath, "*.md")); err == nil {
		steeringFiles = len(files)
	}

	// Count skill folders
	skillsPath := filepath.Join(kiroPath, "skills")
	skillFolders := 0
	if entries, err := os.ReadDir(skillsPath); err == nil {
		for _, entry := range entries {
			if entry.IsDir() {
				skillFolders++
			}
		}
	}

	return Counts{
		McpServers:     mcpCount,
		Agents:         agentCount,
		Workspaces:     len(s.kiroService.GetWorkspaces()),
		TotalTools:     totalTools,
		TotalHooks:     totalHooks,
		TotalResources: totalResources,
		SteeringFiles:  steeringFiles,
		SkillFolders:   skillFolders,
	}
}

// GetDashboardCounts returns counts for global, workspace, or both scopes.
func (s *DashboardService) GetDashboardCounts(scope string) map[string]interface{} {
	globalPath := s.kiroService.GetGlobalConfigPath()
	workspacePath := s.kiroService.GetActiveWorkspace()

	result := map[string]interface{}{}

	switch scope {
	case "workspace":
		if workspacePath != "" {
			p := filepath.Join(workspacePath, ".kiro")
			result["workspace"] = s.getCountsForPath(p)
			result["agents"] = s.getAgentsForPath(p)
			result["mcpServers"] = s.getMCPServersForPath(p)
			result["setup"] = s.getSetupForPath(p)
		}
	case "both":
		g := s.getCountsForPath(globalPath)
		result["global"] = g
		gAgents := s.getAgentsForPath(globalPath)
		gMCP := s.getMCPServersForPath(globalPath)
		if workspacePath != "" {
			wp := filepath.Join(workspacePath, ".kiro")
			w := s.getCountsForPath(wp)
			result["workspace"] = w
			result["combined"] = Counts{
				McpServers:     g.McpServers + w.McpServers,
				Agents:         g.Agents + w.Agents,
				Workspaces:     g.Workspaces,
				TotalTools:     g.TotalTools + w.TotalTools,
				TotalHooks:     g.TotalHooks + w.TotalHooks,
				TotalResources: g.TotalResources + w.TotalResources,
				SteeringFiles:  g.SteeringFiles + w.SteeringFiles,
				SkillFolders:   g.SkillFolders + w.SkillFolders,
			}
			wAgents := s.getAgentsForPath(wp)
			wMCP := s.getMCPServersForPath(wp)
			result["agents"] = append(gAgents, wAgents...)
			result["mcpServers"] = append(gMCP, wMCP...)
			result["setup"] = s.getSetupForPath(globalPath) // use global for combined
		} else {
			result["agents"] = gAgents
			result["mcpServers"] = gMCP
			result["setup"] = s.getSetupForPath(globalPath)
		}
	default: // global
		result["global"] = s.getCountsForPath(globalPath)
		result["agents"] = s.getAgentsForPath(globalPath)
		result["mcpServers"] = s.getMCPServersForPath(globalPath)
		result["setup"] = s.getSetupForPath(globalPath)
	}

	return result
}

// getAgentsForPath reads agent JSON files from a .kiro path and returns
// summary information for each agent.
func (s *DashboardService) getAgentsForPath(kiroPath string) []map[string]interface{} {
	var agents []map[string]interface{}
	agentsPath := filepath.Join(kiroPath, "agents")
	entries, err := os.ReadDir(agentsPath)
	if err != nil {
		return agents
	}
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}
		data, err := os.ReadFile(filepath.Join(agentsPath, entry.Name()))
		if err != nil {
			continue
		}
		var agent map[string]interface{}
		if err := json.Unmarshal(data, &agent); err != nil {
			continue
		}
		toolsCount := 0
		resourcesCount := 0
		hooksCount := 0
		if tools, ok := agent["tools"].([]interface{}); ok {
			toolsCount = len(tools)
		}
		if resources, ok := agent["resources"].([]interface{}); ok {
			resourcesCount = len(resources)
		}
		if hooks, ok := agent["hooks"].(map[string]interface{}); ok {
			hooksCount = len(hooks)
		}
		agents = append(agents, map[string]interface{}{
			"name":      agent["name"],
			"model":     agent["model"],
			"tools":     toolsCount,
			"resources": resourcesCount,
			"hooks":     hooksCount,
		})
	}
	return agents
}

// getMCPServersForPath reads MCP servers from a .kiro path and returns
// summary information for each server.
func (s *DashboardService) getMCPServersForPath(kiroPath string) []map[string]interface{} {
	var servers []map[string]interface{}
	mcpConfigPath := filepath.Join(kiroPath, "settings", "mcp.json")
	data, err := os.ReadFile(mcpConfigPath)
	if err != nil {
		return servers
	}
	var config map[string]interface{}
	if err := json.Unmarshal(data, &config); err != nil {
		return servers
	}
	mcpServers, ok := config["mcpServers"].(map[string]interface{})
	if !ok {
		return servers
	}
	for name, val := range mcpServers {
		srv, ok := val.(map[string]interface{})
		if !ok {
			continue
		}
		serverType := "stdio"
		if _, hasURL := srv["url"]; hasURL {
			serverType = "http"
		}
		enabled := true
		if d, ok := srv["disabled"].(bool); ok && d {
			enabled = false
		}
		servers = append(servers, map[string]interface{}{
			"name":    name,
			"type":    serverType,
			"enabled": enabled,
		})
	}
	return servers
}

// getSetupForPath returns setup/progress info for a specific .kiro path.
func (s *DashboardService) getSetupForPath(kiroPath string) map[string]interface{} {
	agentsPath := filepath.Join(kiroPath, "agents")
	steeringPath := filepath.Join(kiroPath, "steering")
	skillsPath := filepath.Join(kiroPath, "skills")
	mcpServers := s.getMCPServersForPath(kiroPath)

	// Read raw agent JSON for detailed field checks
	hasAgents := false
	agentHasDescription := false
	agentHasPrompt := false
	agentHasModel := false
	agentHasTools := false
	agentHasAllowedTools := false
	agentHasToolAliases := false
	agentHasToolsSettings := false
	agentHasSubagents := false
	agentHasWelcomeMsg := false
	agentHasShortcut := false
	agentHasIncludeMcp := false
	agentHasResources := false
	agentHasSteering := false
	agentHasSkillRes := false
	agentHasHooks := false

	if entries, err := os.ReadDir(agentsPath); err == nil {
		for _, entry := range entries {
			if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" { continue }
			data, err := os.ReadFile(filepath.Join(agentsPath, entry.Name()))
			if err != nil { continue }
			var a map[string]interface{}
			if err := json.Unmarshal(data, &a); err != nil { continue }
			hasAgents = true
			if v, _ := a["description"].(string); v != "" { agentHasDescription = true }
			if v, _ := a["prompt"].(string); v != "" { agentHasPrompt = true }
			if v, _ := a["model"].(string); v != "" { agentHasModel = true }
			if t, ok := a["tools"].([]interface{}); ok && len(t) > 0 { agentHasTools = true }
			if t, ok := a["allowedTools"].([]interface{}); ok && len(t) > 0 { agentHasAllowedTools = true }
			if a["toolAliases"] != nil { agentHasToolAliases = true }
			if a["toolsSettings"] != nil { agentHasToolsSettings = true }
			if v, _ := a["welcomeMessage"].(string); v != "" { agentHasWelcomeMsg = true }
			if v, _ := a["keyboardShortcut"].(string); v != "" { agentHasShortcut = true }
			if a["includeMcpJson"] != nil { agentHasIncludeMcp = true }
			if a["hooks"] != nil { agentHasHooks = true }
			if ts, ok := a["toolsSettings"].(map[string]interface{}); ok {
				if _, has := ts["subagent"]; has { agentHasSubagents = true }
			}
			if res, ok := a["resources"].([]interface{}); ok {
				for _, r := range res {
					if rs, ok := r.(string); ok {
						agentHasResources = true
						if strings.Contains(rs, "steering") { agentHasSteering = true }
						if strings.HasPrefix(rs, "skill://") { agentHasSkillRes = true }
					}
				}
			}
		}
	}

	hasMcp := len(mcpServers) > 0
	hasEnabled := false
	for _, srv := range mcpServers {
		if e, ok := srv["enabled"].(bool); ok && e { hasEnabled = true; break }
	}

	hasSteeringFiles := false
	if files, err := filepath.Glob(filepath.Join(steeringPath, "*.md")); err == nil && len(files) > 0 {
		hasSteeringFiles = true
	}

	hasSkills := false
	if entries, err := os.ReadDir(skillsPath); err == nil {
		for _, entry := range entries {
			if entry.IsDir() { hasSkills = true; break }
		}
	}

	hasWorkspaces := len(s.kiroService.GetWorkspaces()) > 0

	checks := []bool{
		hasAgents, agentHasDescription, agentHasPrompt, agentHasModel,
		agentHasTools, agentHasAllowedTools, agentHasToolAliases, agentHasToolsSettings,
		agentHasSubagents, agentHasWelcomeMsg, agentHasShortcut,
		hasMcp, hasEnabled, agentHasIncludeMcp,
		agentHasResources, agentHasSteering, agentHasSkillRes,
		agentHasHooks,
		hasSteeringFiles,
		hasSkills,
		hasWorkspaces,
	}
	completed := 0
	for _, c := range checks { if c { completed++ } }
	total := len(checks)

	return map[string]interface{}{
		"hasAgents":            hasAgents,
		"agentHasDescription":  agentHasDescription,
		"agentHasPrompt":       agentHasPrompt,
		"agentHasModel":        agentHasModel,
		"agentHasTools":        agentHasTools,
		"agentHasAllowedTools": agentHasAllowedTools,
		"agentHasToolAliases":  agentHasToolAliases,
		"agentHasToolsSettings": agentHasToolsSettings,
		"agentHasSubagents":    agentHasSubagents,
		"agentHasWelcomeMsg":   agentHasWelcomeMsg,
		"agentHasShortcut":     agentHasShortcut,
		"hasMcpServers":        hasMcp,
		"hasEnabledMcp":        hasEnabled,
		"agentHasIncludeMcp":   agentHasIncludeMcp,
		"agentHasResources":    agentHasResources,
		"agentHasSteering":     agentHasSteering,
		"agentHasSkillRes":     agentHasSkillRes,
		"agentHasHooks":        agentHasHooks,
		"hasSteeringFiles":     hasSteeringFiles,
		"hasSkills":            hasSkills,
		"hasWorkspaces":        hasWorkspaces,
		"progress": map[string]interface{}{
			"completed":  completed,
			"total":      total,
			"percentage": int(float64(completed) / float64(total) * 100),
		},
	}
}

// PerformSetupAction executes a setup action such as creating required directories.
func (s *DashboardService) PerformSetupAction(action string) (map[string]interface{}, error) {
	configPath := s.kiroService.GetConfigPath()

	switch action {
	case "create_kiro_dir":
		if err := os.MkdirAll(configPath, 0755); err != nil {
			return nil, utils.NewAppError("Failed to create Kiro directory", 500, "CREATE_DIR_ERROR")
		}
		s.logger.Info("Created Kiro directory: %s", configPath)

	case "create_settings_dir":
		settingsPath := filepath.Join(configPath, "settings")
		if err := os.MkdirAll(settingsPath, 0755); err != nil {
			return nil, utils.NewAppError("Failed to create settings directory", 500, "CREATE_DIR_ERROR")
		}
		s.logger.Info("Created settings directory: %s", settingsPath)

	case "create_agents_dir":
		agentsPath := filepath.Join(configPath, "agents")
		if err := os.MkdirAll(agentsPath, 0755); err != nil {
			return nil, utils.NewAppError("Failed to create agents directory", 500, "CREATE_DIR_ERROR")
		}
		s.logger.Info("Created agents directory: %s", agentsPath)

	default:
		return nil, utils.NewAppError("Unknown action", 400, "INVALID_ACTION")
	}

	return map[string]interface{}{
		"success": true,
		"message": "Action completed successfully",
		"action":  action,
	}, nil
}

// MCPProfileStats holds statistics for a single MCP profile.
type MCPProfileStats struct {
	Name          string `json:"name"`
	IsActive      bool   `json:"isActive"`
	ServerCount   int    `json:"serverCount"`
	StdioCount    int    `json:"stdioCount"`
	HttpCount     int    `json:"httpCount"`
	EnabledCount  int    `json:"enabledCount"`
	DisabledCount int    `json:"disabledCount"`
}

// MCPProfilesResponse contains the current profile name and all profile statistics.
type MCPProfilesResponse struct {
	CurrentProfile string            `json:"currentProfile"`
	Profiles       []MCPProfileStats `json:"profiles"`
}

// GetMCPProfilesWithStats returns MCP profile statistics.
// The profile system has been removed; this returns empty data.
func (s *DashboardService) GetMCPProfilesWithStats() (*MCPProfilesResponse, error) {
	// Profile system removed - return empty data
	return &MCPProfilesResponse{
		CurrentProfile: "",
		Profiles:       []MCPProfileStats{},
	}, nil
}

// AgentStats holds summary statistics for a single agent.
type AgentStats struct {
	Name            string `json:"name"`
	Model           string `json:"model"`
	ToolsCount      int    `json:"toolsCount"`
	ResourcesCount  int    `json:"resourcesCount"`
	McpServersCount int    `json:"mcpServersCount"`
	HooksCount      int    `json:"hooksCount"`
	SteeringEnabled bool   `json:"steeringEnabled"`
}

// AgentsResponse contains the total agent count and per-agent statistics.
type AgentsResponse struct {
	TotalCount int          `json:"totalCount"`
	Agents     []AgentStats `json:"agents"`
}

// GetAgentsWithStats returns all agents with their computed statistics.
func (s *DashboardService) GetAgentsWithStats() (*AgentsResponse, error) {
	// Get all agents from agent service
	agents, err := s.agentService.GetAllAgents()
	if err != nil {
		return nil, err
	}

	// Initialize as empty slice, not nil
	agentStats := []AgentStats{}

	for _, agent := range agents {
		stats := AgentStats{
			Name:           agent.Name,
			Model:          agent.Model,
			ToolsCount:     len(agent.Tools),
			ResourcesCount: len(agent.Resources),
		}

		// Count MCP servers
		if agent.MCPServers != nil {
			if mcpMap, ok := agent.MCPServers.(map[string]interface{}); ok {
				stats.McpServersCount = len(mcpMap)
			}
		}

		// Count hooks
		if agent.Hooks != nil {
			if hooksMap, ok := agent.Hooks.(map[string]interface{}); ok {
				stats.HooksCount = len(hooksMap)
			}
		}

		// Check if steering is enabled (has file://.kiro/steering/**/*.md in resources)
		stats.SteeringEnabled = false
		for _, resource := range agent.Resources {
			if strings.Contains(resource, "file://.kiro/steering/") {
				stats.SteeringEnabled = true
				break
			}
		}

		agentStats = append(agentStats, stats)
	}

	return &AgentsResponse{
		TotalCount: len(agentStats),
		Agents:     agentStats,
	}, nil
}
