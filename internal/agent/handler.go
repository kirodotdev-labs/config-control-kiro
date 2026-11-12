package agent

import (
	"net/http"

	"kiromanager/internal/shared/ordered"
	"kiromanager/internal/shared/utils"
)

// Handler exposes agent specs over HTTP.
type Handler struct {
	service *AgentService
}

// NewHandler creates a Handler backed by service.
func NewHandler(service *AgentService) *Handler {
	return &Handler{service: service}
}

// GetAgents handles GET /agents: summaries of every agent in the active scope.
func (h *Handler) GetAgents(w http.ResponseWriter, r *http.Request) {
	utils.RespondJSON(w, http.StatusOK, h.service.List())
}

// GetAllAgentNames handles GET /agents/all-names: ids across scope and global.
func (h *Handler) GetAllAgentNames(w http.ResponseWriter, r *http.Request) {
	utils.RespondJSON(w, http.StatusOK, h.service.AllNames())
}

// GetAgent handles GET /agents/{name}: the full spec, fields in file order.
func (h *Handler) GetAgent(w http.ResponseWriter, r *http.Request) {
	spec, err := h.service.Get(r.PathValue("name"))
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, spec)
}

// CreateAgent handles POST /agents with a new spec; responds with its id.
func (h *Handler) CreateAgent(w http.ResponseWriter, r *http.Request) {
	spec := ordered.New()
	if !utils.DecodeJSON(w, r, spec) {
		return
	}
	id, err := h.service.Create(spec)
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusCreated, map[string]string{"id": id})
}

// UpdateAgent handles PUT /agents/{name} with the complete edited spec.
func (h *Handler) UpdateAgent(w http.ResponseWriter, r *http.Request) {
	spec := ordered.New()
	if !utils.DecodeJSON(w, r, spec) {
		return
	}
	if err := h.service.Update(r.PathValue("name"), spec); err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, spec)
}

// DeleteAgent handles DELETE /agents/{name}.
func (h *Handler) DeleteAgent(w http.ResponseWriter, r *http.Request) {
	if err := h.service.Delete(r.PathValue("name")); err != nil {
		utils.RespondError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GetRelations handles GET /relations?id=<navigator id>: what that item is
// connected to (an agent's files, or the agents using a file).
func (h *Handler) GetRelations(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		utils.RespondError(w, utils.BadRequest("id is required", "INVALID_REQUEST"))
		return
	}
	utils.RespondJSON(w, http.StatusOK, h.service.Relations(id))
}

// MeasureServers handles POST /agents/{name}/measure: lists the tools of the
// agent's MCP servers whose size isn't known yet, so its context can be shown.
func (h *Handler) MeasureServers(w http.ResponseWriter, r *http.Request) {
	out, err := h.service.MeasureServers(r.PathValue("name"))
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, out)
}

// GetServerTools handles GET /agents/{name}/server-tools: the measured tools
// of the agent's MCP servers, by server.
func (h *Handler) GetServerTools(w http.ResponseWriter, r *http.Request) {
	out, err := h.service.ServerTools(r.PathValue("name"))
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, out)
}

// EstimateKnowledge handles POST /knowledge/estimate with {folder, include,
// exclude}: how many files an agent knowledge base would cover.
func (h *Handler) EstimateKnowledge(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Folder  string   `json:"folder"`
		Include []string `json:"include"`
		Exclude []string `json:"exclude"`
	}
	if !utils.DecodeJSON(w, r, &req) {
		return
	}
	est, err := EstimateFolder(req.Folder, req.Include, req.Exclude)
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, est)
}
