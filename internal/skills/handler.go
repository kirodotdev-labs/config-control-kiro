package skills

import (
	"net/http"

	"kiromanager/internal/shared/utils"
)

// Handler provides HTTP handlers for skills management.
type Handler struct {
	service *Service
}

// NewHandler creates a new Handler backed by the given skills Service.
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// Deactivate handles POST requests to remove all active skills.
func (h *Handler) Deactivate(w http.ResponseWriter, r *http.Request) {
	if err := h.service.Deactivate(); err != nil {
		utils.RespondError(w, err)
		return
	}

	utils.RespondJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}
