package dashboard

import (
	"encoding/json"
	"net/http"

	"kiromanager/internal/shared/utils"
)

// Handler provides HTTP handlers for dashboard endpoints.
type Handler struct {
	service *DashboardService
}

// NewHandler creates a new Handler backed by the given DashboardService.
func NewHandler(service *DashboardService) *Handler {
	return &Handler{service: service}
}

// GetSetupStatus handles GET requests to return the setup checklist status.
func (h *Handler) GetSetupStatus(w http.ResponseWriter, r *http.Request) {
	status, err := h.service.GetSetupStatus()
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, status)
}

// PerformSetupAction handles POST requests to perform a setup action (e.g. create directories).
func (h *Handler) PerformSetupAction(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Action string `json:"action"`
	}

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		utils.RespondError(w, utils.NewAppError("Invalid request body", 400, "INVALID_REQUEST"))
		return
	}

	if request.Action == "" {
		utils.RespondError(w, utils.NewAppError("Action is required", 400, "MISSING_ACTION"))
		return
	}

	result, err := h.service.PerformSetupAction(request.Action)
	if err != nil {
		utils.RespondError(w, err)
		return
	}

	utils.RespondJSON(w, http.StatusOK, result)
}

// GetMCPProfiles handles GET requests to return MCP profiles with server statistics.
func (h *Handler) GetMCPProfiles(w http.ResponseWriter, r *http.Request) {
	profiles, err := h.service.GetMCPProfilesWithStats()
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, profiles)
}

// GetAgents handles GET requests to return agents with statistics.
func (h *Handler) GetAgents(w http.ResponseWriter, r *http.Request) {
	agents, err := h.service.GetAgentsWithStats()
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, agents)
}

// GetDashboardCounts handles GET requests to return resource counts for a specific scope.
// Query parameter: scope (optional, defaults to "global"; also accepts "workspace" or "both").
func (h *Handler) GetDashboardCounts(w http.ResponseWriter, r *http.Request) {
	scope := r.URL.Query().Get("scope")
	if scope == "" {
		scope = "global"
	}
	utils.RespondJSON(w, http.StatusOK, h.service.GetDashboardCounts(scope))
}
