package workflows

import (
	"net/http"

	"kiromanager/internal/shared/utils"
)

// Handler serves the workflow runs API (read only).
type Handler struct{ service *Service }

// NewHandler creates a Handler for service.
func NewHandler(service *Service) *Handler { return &Handler{service: service} }

// ListRuns handles GET /workflows/runs: the runs of the active scope.
func (h *Handler) ListRuns(w http.ResponseWriter, r *http.Request) {
	utils.RespondJSON(w, http.StatusOK, h.service.List())
}

// GetRun handles GET /workflows/runs/{id}: one run in full.
func (h *Handler) GetRun(w http.ResponseWriter, r *http.Request) {
	d, err := h.service.Get(r.PathValue("id"))
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, d)
}
