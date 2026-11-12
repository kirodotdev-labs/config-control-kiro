package mcp

import (
	"net/http"

	"kiromanager/internal/shared/ordered"
	"kiromanager/internal/shared/utils"
)

// Handler exposes MCP configuration and tool discovery over HTTP.
type Handler struct {
	service *MCPService
}

// NewHandler creates a new Handler backed by the given MCPService.
func NewHandler(service *MCPService) *Handler {
	return &Handler{service: service}
}

// GetMCPConfig handles GET /mcp/config: mcp.json for the active scope.
func (h *Handler) GetMCPConfig(w http.ResponseWriter, r *http.Request) {
	doc, err := h.service.GetMCPConfig()
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, doc)
}

// SaveMCPConfig handles POST /mcp/config with {config}: writes mcp.json.
func (h *Handler) SaveMCPConfig(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Config *ordered.Object `json:"config"`
	}
	if !utils.DecodeJSON(w, r, &req) {
		return
	}
	path, err := h.service.SaveMCPConfig(req.Config)
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, map[string]string{"path": path})
}

// GetAgentMCPTools handles POST requests to fetch tools from agent-specific MCP server configs
// provided in the request body.
func (h *Handler) GetAgentMCPTools(w http.ResponseWriter, r *http.Request) {
	var requestBody struct {
		MCPServers map[string]*MCPServerConfig `json:"mcpServers"`
	}

	if !utils.DecodeJSON(w, r, &requestBody) {
		return
	}

	tools, err := h.service.GetToolsFromConfig(requestBody.MCPServers)
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, tools)
}
