package sandbox

import (
	"net/http"

	"kiromanager/internal/shared/ordered"
	"kiromanager/internal/shared/utils"
)

// Handler provides HTTP handlers for sandbox.json management.
type Handler struct {
	service *Service
}

// NewHandler creates a new sandbox Handler.
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// GetSandbox handles GET /sandbox — the active-scope document.
func (h *Handler) GetSandbox(w http.ResponseWriter, r *http.Request) {
	doc, err := h.service.Get()
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, doc)
}

// SaveSandbox handles POST /sandbox — writes the config document.
func (h *Handler) SaveSandbox(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Config *ordered.Object `json:"config"`
	}
	if !utils.DecodeJSON(w, r, &req) {
		return
	}
	if err := h.service.Save(req.Config); err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, map[string]bool{"success": true})
}
