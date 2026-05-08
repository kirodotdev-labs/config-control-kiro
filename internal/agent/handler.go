package agent

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
	"kiromanager/internal/models"
	"kiromanager/internal/shared/utils"
)

// Handler exposes HTTP endpoints for agent CRUD operations.
type Handler struct {
	service *AgentService
}

// NewHandler creates a Handler backed by the given AgentService.
func NewHandler(service *AgentService) *Handler {
	return &Handler{service: service}
}

// GetAgents handles GET requests and returns all agents.
func (h *Handler) GetAgents(w http.ResponseWriter, r *http.Request) {
	agents, err := h.service.GetAllAgents()
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, agents)
}

// GetAllAgentNames handles GET requests and returns all agent names.
func (h *Handler) GetAllAgentNames(w http.ResponseWriter, r *http.Request) {
	names := h.service.GetAllAgentNames()
	utils.RespondJSON(w, http.StatusOK, names)
}

// GetAgent handles GET requests for a single agent by name.
func (h *Handler) GetAgent(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	name := utils.SanitizeName(vars["name"])

	agent, err := h.service.GetAgent(name)
	if err != nil {
		utils.RespondError(w, utils.NewAppError(err.Error(), 404, "AGENT_NOT_FOUND"))
		return
	}
	utils.RespondJSON(w, http.StatusOK, agent)
}

// CreateAgent handles POST requests to create a new agent.
func (h *Handler) CreateAgent(w http.ResponseWriter, r *http.Request) {
	var agent models.Agent
	json.NewDecoder(r.Body).Decode(&agent)

	if err := h.service.CreateAgent(&agent); err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, agent)
}

// UpdateAgent handles PUT requests to update an existing agent by name.
func (h *Handler) UpdateAgent(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	name := utils.SanitizeName(vars["name"])

	var agent models.Agent
	json.NewDecoder(r.Body).Decode(&agent)

	if err := h.service.UpdateAgent(name, &agent); err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, agent)
}

// DeleteAgent handles DELETE requests to remove an agent by name.
func (h *Handler) DeleteAgent(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	name := utils.SanitizeName(vars["name"])

	if err := h.service.DeleteAgent(name); err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Agent deleted successfully",
	})
}

// GetAgentConfig handles GET requests and returns the agent configuration.
func (h *Handler) GetAgentConfig(w http.ResponseWriter, r *http.Request) {
	utils.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"data": map[string]interface{}{
			"agents": map[string]interface{}{},
		},
	})
}

// SaveAgentConfig handles POST requests to save agent configuration.
func (h *Handler) SaveAgentConfig(w http.ResponseWriter, r *http.Request) {
	utils.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Agent configuration saved",
	})
}
