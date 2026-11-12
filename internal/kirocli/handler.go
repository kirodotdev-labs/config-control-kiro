package kirocli

import (
	"net/http"

	"kiromanager/internal/shared/utils"
)

// Handler exposes kiro-cli status and models over HTTP.
type Handler struct{ service *Service }

// NewHandler creates a Handler backed by service.
func NewHandler(service *Service) *Handler { return &Handler{service: service} }

// GetStatus handles GET /kiro/status[?refresh=1].
func (h *Handler) GetStatus(w http.ResponseWriter, r *http.Request) {
	utils.RespondJSON(w, http.StatusOK, h.service.Status(r.URL.Query().Get("refresh") == "1"))
}

// GetModels handles GET /kiro/models[?refresh=1].
func (h *Handler) GetModels(w http.ResponseWriter, r *http.Request) {
	utils.RespondJSON(w, http.StatusOK, h.service.Models(r.URL.Query().Get("refresh") == "1"))
}

// GetSettingsCatalog handles GET /kiro/settings[?refresh=1].
func (h *Handler) GetSettingsCatalog(w http.ResponseWriter, r *http.Request) {
	utils.RespondJSON(w, http.StatusOK, h.service.SettingsCatalog(r.URL.Query().Get("refresh") == "1"))
}
