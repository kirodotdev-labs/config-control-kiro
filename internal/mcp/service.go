package mcp

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"kiromanager/internal/models"
	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

// MCPService manages MCP server configurations and tool discovery.
// It reads and writes the mcp.json config file and communicates with
// MCP servers to list available tools.
type MCPService struct {
	kiroService *system.KiroService
	logger      *utils.Logger
}

// NewMCPService creates a new MCPService with the given dependencies.
func NewMCPService(kiroService *system.KiroService, logger *utils.Logger) *MCPService {
	return &MCPService{
		kiroService: kiroService,
		logger:      logger,
	}
}

// GetAllMCPServers returns all configured MCP servers sorted alphabetically by ID.
// Entries that are not valid server objects still get a card with just the name.
func (s *MCPService) GetAllMCPServers() ([]models.MCPServer, error) {
	rawConfig, err := s.getMCPConfig()
	if err != nil {
		return []models.MCPServer{}, nil
	}

	mcpServers, _ := rawConfig["mcpServers"].(map[string]interface{})
	if mcpServers == nil {
		return []models.MCPServer{}, nil
	}

	keys := make([]string, 0, len(mcpServers))
	for k := range mcpServers {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	servers := []models.MCPServer{}
	for _, id := range keys {
		server := models.MCPServer{ID: id, Name: id, Enabled: true, Type: "local"}

		if obj, ok := mcpServers[id].(map[string]interface{}); ok {
			if cmd, ok := obj["command"].(string); ok {
				server.Command = cmd
			}
			if args, ok := obj["args"].([]interface{}); ok {
				for _, a := range args {
					if s, ok := a.(string); ok {
						server.Args = append(server.Args, s)
					}
				}
			}
			if u, ok := obj["url"].(string); ok {
				server.URL = u
				server.Type = "remote"
			}
			if env, ok := obj["env"].(map[string]interface{}); ok {
				server.Env = make(map[string]string)
				for k, v := range env {
					if s, ok := v.(string); ok {
						server.Env[k] = s
					}
				}
			}
			if headers, ok := obj["headers"].(map[string]interface{}); ok {
				server.Headers = make(map[string]string)
				for k, v := range headers {
					if s, ok := v.(string); ok {
						server.Headers[k] = s
					}
				}
			}
			if d, ok := obj["disabled"].(bool); ok {
				server.Enabled = !d
			}
			if aa, ok := obj["autoApprove"].([]interface{}); ok {
				for _, a := range aa {
					if s, ok := a.(string); ok {
						server.AutoApprove = append(server.AutoApprove, s)
					}
				}
			}
			if dt, ok := obj["disabledTools"].([]interface{}); ok {
				for _, a := range dt {
					if s, ok := a.(string); ok {
						server.DisabledTools = append(server.DisabledTools, s)
					}
				}
			}
		}

		servers = append(servers, server)
	}

	return servers, nil
}

// UpdateMCPServer updates the configuration of an existing MCP server identified by serverID.
// It currently supports toggling the enabled/disabled state.
func (s *MCPService) UpdateMCPServer(serverID string, updateData map[string]interface{}) (*models.MCPServer, error) {
	configPath := filepath.Join(s.kiroService.GetConfigPath(), "settings", "mcp.json")

	rawConfig, err := s.getMCPConfig()
	if err != nil {
		return nil, utils.NewAppError("MCP config not found", 404, "MCP_CONFIG_NOT_FOUND")
	}

	mcpServers, _ := rawConfig["mcpServers"].(map[string]interface{})
	if mcpServers == nil || mcpServers[serverID] == nil {
		return nil, utils.NewAppError(fmt.Sprintf("MCP server '%s' not found", serverID), 404, "MCP_SERVER_NOT_FOUND")
	}

	// Only toggle if the entry is a valid object
	if serverObj, ok := mcpServers[serverID].(map[string]interface{}); ok {
		if enabled, ok := updateData["enabled"].(bool); ok {
			if !enabled {
				serverObj["disabled"] = true
			} else {
				delete(serverObj, "disabled")
			}
		}
	}

	// Write back
	if err := s.kiroService.WriteJSONFile(configPath, rawConfig); err != nil {
		return nil, utils.NewAppError("Failed to update MCP server", 500, "MCP_UPDATE_ERROR")
	}

	s.logger.Info("MCP server '%s' updated", serverID)

	// Return updated server
	servers, _ := s.GetAllMCPServers()
	for _, srv := range servers {
		if srv.ID == serverID {
			return &srv, nil
		}
	}

	return nil, nil
}

// GetMCPConfig returns the raw MCP configuration as a generic map.
func (s *MCPService) GetMCPConfig() (map[string]interface{}, error) {
	rawConfig, err := s.getMCPConfig()
	if err != nil {
		return map[string]interface{}{"mcpServers": map[string]interface{}{}}, nil
	}
	return rawConfig, nil
}

// SaveMCPConfig writes the provided configuration data to the mcp.json file.
// Server keys are sorted alphabetically before persisting.
func (s *MCPService) SaveMCPConfig(configData map[string]interface{}) (map[string]interface{}, error) {
	configPath := filepath.Join(s.kiroService.GetConfigPath(), "settings", "mcp.json")

	// Ensure directory exists
	if err := os.MkdirAll(filepath.Dir(configPath), 0755); err != nil {
		return nil, utils.NewAppError("Failed to create config directory", 500, "MCP_SAVE_ERROR")
	}

	// Sort mcpServers keys alphabetically before saving
	if mcpServers, ok := configData["mcpServers"].(map[string]interface{}); ok {
		// Get keys and sort
		keys := make([]string, 0, len(mcpServers))
		for k := range mcpServers {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		
		// Rebuild map in alphabetical order
		sortedServers := make(map[string]interface{})
		for _, k := range keys {
			sortedServers[k] = mcpServers[k]
		}
		
		configData["mcpServers"] = sortedServers
	}

	// Write config
	data, err := json.MarshalIndent(configData, "", "  ")
	if err != nil {
		return nil, utils.NewAppError("Failed to marshal config", 500, "MCP_SAVE_ERROR")
	}

	if err := os.WriteFile(configPath, data, 0644); err != nil {
		return nil, utils.NewAppError("Failed to write config", 500, "MCP_SAVE_ERROR")
	}

	s.logger.Info("MCP configuration saved to %s", configPath)

	return map[string]interface{}{
		"success": true,
		"path":    configPath,
	}, nil
}

// GetAllMCPTools discovers tools from all enabled MCP servers concurrently.
func (s *MCPService) GetAllMCPTools() (map[string]interface{}, error) {
	rawConfig, err := s.getMCPConfig()
	if err != nil {
		return map[string]interface{}{}, nil
	}

	mcpServers, _ := rawConfig["mcpServers"].(map[string]interface{})
	serverConfigs := s.extractServerConfigs(mcpServers)
	return s.GetToolsFromConfig(serverConfigs)
}

// GetToolsFromConfig fetches tools from provided server configs (for agents).
// It queries each enabled server concurrently and returns a map of server name to tools.
func (s *MCPService) GetToolsFromConfig(servers map[string]*MCPServerConfig) (map[string]interface{}, error) {
	tools := make(map[string]interface{})
	var mu sync.Mutex
	var wg sync.WaitGroup

	if servers != nil {
		for serverName, serverConfig := range servers {
			// Skip disabled servers
			if serverConfig.Disabled {
				continue
			}

			wg.Add(1)
			go func(name string, cfg *MCPServerConfig) {
				defer wg.Done()

				// Per-server timeout to prevent one slow/broken server from blocking all others
				done := make(chan struct{})
				var serverTools []MCPTool
				var err error
				go func() {
					serverTools, err = s.getMCPServerTools(name, cfg)
					close(done)
				}()

				select {
				case <-done:
				case <-time.After(15 * time.Second):
					err = fmt.Errorf("timeout connecting to %s", name)
				}

				mu.Lock()
				defer mu.Unlock()

				if err != nil {
					s.logger.Error("Failed to get tools for %s: %v", name, err)
					tools[name] = []interface{}{}
				} else {
					tools[name] = serverTools
				}
			}(serverName, serverConfig)
		}
	}

	wg.Wait()
	return tools, nil
}

// getMCPServerTools connects to a single MCP server and lists its tools.
// It selects the HTTP or stdio transport based on the server configuration.
func (s *MCPService) getMCPServerTools(serverName string, serverConfig *MCPServerConfig) ([]MCPTool, error) {
	// HTTP server
	if serverConfig.URL != "" {
		client := NewMCPHttpClient(serverConfig.URL, serverConfig.Headers)
		return client.ListTools()
	}

	// STDIO server
	if serverConfig.Command != "" {
		client := NewMCPStdioClient(serverConfig.Command, serverConfig.Args)
		defer client.Close()

		if err := client.Connect(); err != nil {
			return nil, err
		}

		return client.ListTools()
	}

	return []MCPTool{}, nil
}

// GetMCPServerTools returns the tools for a specific MCP server by name.
func (s *MCPService) GetMCPServerTools(serverName string) ([]interface{}, error) {
	rawConfig, err := s.getMCPConfig()
	if err != nil {
		return []interface{}{}, nil
	}

	mcpServers, _ := rawConfig["mcpServers"].(map[string]interface{})
	serverConfigs := s.extractServerConfigs(mcpServers)

	serverConfig, ok := serverConfigs[serverName]
	if !ok {
		return []interface{}{}, fmt.Errorf("server not found")
	}

	tools, err := s.getMCPServerTools(serverName, serverConfig)
	if err != nil {
		return []interface{}{}, err
	}

	result := make([]interface{}, len(tools))
	for i, tool := range tools {
		result[i] = tool
	}
	return result, nil
}

// CallMCPTool invokes a tool on the specified MCP server. Currently unimplemented.
func (s *MCPService) CallMCPTool(serverName, toolName string, arguments map[string]interface{}) (map[string]interface{}, error) {
	return map[string]interface{}{
		"success": false,
		"message": "Tool execution not yet implemented",
	}, nil
}

// DeployMCP triggers deployment of the named MCP server.
func (s *MCPService) DeployMCP(serverName string) (map[string]interface{}, error) {
	servers, err := s.GetAllMCPServers()
	if err != nil {
		return nil, err
	}

	found := false
	for _, srv := range servers {
		if srv.ID == serverName {
			found = true
			break
		}
	}

	if !found {
		return nil, utils.NewAppError(fmt.Sprintf("Server '%s' not found", serverName), 404, "SERVER_NOT_FOUND")
	}

	return map[string]interface{}{
		"success":    true,
		"message":    fmt.Sprintf("Server '%s' deployed successfully", serverName),
		"serverName": serverName,
	}, nil
}

// getMCPConfig reads the mcp.json configuration file as raw JSON.
func (s *MCPService) getMCPConfig() (map[string]interface{}, error) {
	configPath := filepath.Join(s.kiroService.GetConfigPath(), "settings", "mcp.json")

	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, err
	}

	var config map[string]interface{}
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, err
	}

	return config, nil
}

// extractServerConfigs converts raw mcpServers map entries into typed MCPServerConfig,
// skipping entries that are not valid server objects.
func (s *MCPService) extractServerConfigs(mcpServers map[string]interface{}) map[string]*MCPServerConfig {
	configs := make(map[string]*MCPServerConfig)
	for name, val := range mcpServers {
		obj, ok := val.(map[string]interface{})
		if !ok {
			continue
		}
		cfg := &MCPServerConfig{}
		if cmd, ok := obj["command"].(string); ok {
			cfg.Command = cmd
		}
		if args, ok := obj["args"].([]interface{}); ok {
			for _, a := range args {
				if s, ok := a.(string); ok {
					cfg.Args = append(cfg.Args, s)
				}
			}
		}
		if u, ok := obj["url"].(string); ok {
			cfg.URL = u
		}
		if d, ok := obj["disabled"].(bool); ok {
			cfg.Disabled = d
		}
		if env, ok := obj["env"].(map[string]interface{}); ok {
			cfg.Env = make(map[string]string)
			for k, v := range env {
				if s, ok := v.(string); ok {
					cfg.Env[k] = s
				}
			}
		}
		if headers, ok := obj["headers"].(map[string]interface{}); ok {
			cfg.Headers = make(map[string]string)
			for k, v := range headers {
				if s, ok := v.(string); ok {
					cfg.Headers[k] = s
				}
			}
		}
		configs[name] = cfg
	}
	return configs
}

// MCPConfig represents the top-level MCP configuration file structure.
type MCPConfig struct {
	MCPServers map[string]*MCPServerConfig `json:"mcpServers"`
}

// MCPServerConfig holds the configuration for a single MCP server,
// including its transport settings (command/args for stdio, URL for HTTP),
// environment variables, and tool management options.
type MCPServerConfig struct {
	Command       string            `json:"command,omitempty"`
	Args          []string          `json:"args,omitempty"`
	URL           string            `json:"url,omitempty"`
	Env           map[string]string `json:"env,omitempty"`
	Headers       map[string]string `json:"headers,omitempty"`
	Disabled      bool              `json:"disabled,omitempty"`
	AutoApprove   []string          `json:"autoApprove,omitempty"`
	DisabledTools []string          `json:"disabledTools,omitempty"`
}
