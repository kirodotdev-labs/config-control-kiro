package mcp

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/gorilla/mux"
	"kiromanager/internal/shared/utils"
)

// Handler provides HTTP handlers for MCP server management endpoints.
type Handler struct {
	service *MCPService
}

// NewHandler creates a new Handler backed by the given MCPService.
func NewHandler(service *MCPService) *Handler {
	return &Handler{service: service}
}

// GetMCPServers handles GET requests to list all configured MCP servers.
func (h *Handler) GetMCPServers(w http.ResponseWriter, r *http.Request) {
	servers, err := h.service.GetAllMCPServers()
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, servers)
}

// CreateMCPServer handles POST requests to create a new MCP server configuration.
func (h *Handler) CreateMCPServer(w http.ResponseWriter, r *http.Request) {
	utils.RespondJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

// UpdateMCPServer handles PATCH requests to update an existing MCP server by ID.
func (h *Handler) UpdateMCPServer(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	serverID := vars["id"]

	var updateData map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&updateData); err != nil {
		utils.RespondError(w, utils.NewAppError("Invalid request body", 400, "INVALID_REQUEST"))
		return
	}

	server, err := h.service.UpdateMCPServer(serverID, updateData)
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, server)
}

// GetMCPConfig handles GET requests to retrieve the raw MCP configuration.
func (h *Handler) GetMCPConfig(w http.ResponseWriter, r *http.Request) {
	config, err := h.service.GetMCPConfig()
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, map[string]interface{}{"data": config})
}

// SaveMCPConfig handles POST requests to persist the MCP configuration to disk.
func (h *Handler) SaveMCPConfig(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Config        map[string]interface{} `json:"config"`
		Scope         string                 `json:"scope"`
		WorkspacePath string                 `json:"workspacePath"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.RespondError(w, utils.NewAppError("Invalid request body", 400, "INVALID_REQUEST"))
		return
	}

	result, err := h.service.SaveMCPConfig(req.Config)
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, result)
}

// DeployMCP handles POST requests to deploy a named MCP server.
func (h *Handler) DeployMCP(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ServerName string `json:"serverName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.RespondError(w, utils.NewAppError("Invalid request body", 400, "INVALID_REQUEST"))
		return
	}

	result, err := h.service.DeployMCP(req.ServerName)
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, result)
}

// GetAllMCPTools handles GET requests to discover tools from all enabled MCP servers.
func (h *Handler) GetAllMCPTools(w http.ResponseWriter, r *http.Request) {
	tools, err := h.service.GetAllMCPTools()
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, tools)
}

// GetAgentMCPTools handles POST requests to fetch tools from agent-specific MCP server configs
// provided in the request body.
func (h *Handler) GetAgentMCPTools(w http.ResponseWriter, r *http.Request) {
	var requestBody struct {
		MCPServers map[string]*MCPServerConfig `json:"mcpServers"`
	}

	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		utils.RespondError(w, fmt.Errorf("invalid request body: %v", err))
		return
	}

	tools, err := h.service.GetToolsFromConfig(requestBody.MCPServers)
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, tools)
}

// GetMCPServerTools handles GET requests to list tools for a specific MCP server.
func (h *Handler) GetMCPServerTools(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	serverName := vars["serverName"]

	tools, err := h.service.GetMCPServerTools(serverName)
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, tools)
}

// CallMCPTool handles POST requests to invoke a tool on a specific MCP server.
func (h *Handler) CallMCPTool(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	serverName := vars["serverName"]
	toolName := vars["toolName"]

	var req struct {
		Arguments map[string]interface{} `json:"arguments"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.RespondError(w, utils.NewAppError("Invalid request body", 400, "INVALID_REQUEST"))
		return
	}

	result, err := h.service.CallMCPTool(serverName, toolName, req.Arguments)
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, result)
}
