package permissions

import (
	"net/http"

	"kiromanager/internal/shared/utils"
)

// Handler provides HTTP handlers for permissions.yaml management.
type Handler struct {
	service *Service
}

// NewHandler creates a new permissions Handler.
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// GetPermissions handles GET /permissions — returns the active-scope document.
func (h *Handler) GetPermissions(w http.ResponseWriter, r *http.Request) {
	doc, err := h.service.Get()
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, doc)
}

// GetMeta handles GET /permissions/meta — capability and effect vocabularies.
func (h *Handler) GetMeta(w http.ResponseWriter, r *http.Request) {
	utils.RespondJSON(w, http.StatusOK, h.service.Meta())
}
