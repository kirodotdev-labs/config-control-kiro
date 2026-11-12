package skills

import (
	"net/http"

	"kiromanager/internal/shared/utils"
)

// Handler serves the skills API.
type Handler struct{ service *Service }

// NewHandler creates a Handler for service.
func NewHandler(service *Service) *Handler { return &Handler{service: service} }

// ListSkills handles GET /skills: the skills of the active scope.
func (h *Handler) ListSkills(w http.ResponseWriter, r *http.Request) {
	utils.RespondJSON(w, http.StatusOK, h.service.List())
}

// GetSkill handles GET /skills/{name}: one skill with its files and problems.
func (h *Handler) GetSkill(w http.ResponseWriter, r *http.Request) {
	sk, err := h.service.Get(r.PathValue("name"))
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, sk)
}

// ImportSkill handles POST /skills/import {source}: copies a skill folder in.
func (h *Handler) ImportSkill(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Source string `json:"source"`
	}
	if !utils.DecodeJSON(w, r, &req) {
		return
	}
	sk, err := h.service.Import(req.Source)
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, sk)
}
