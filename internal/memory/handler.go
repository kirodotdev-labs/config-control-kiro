package memory

import (
	"net/http"

	"kiromanager/internal/shared/utils"
)

// Handler provides the HTTP handlers for memories: the list, and changes
// made through Kiro.
type Handler struct {
	service *Service
	editor  *Editor
}

// NewHandler creates a memory Handler.
func NewHandler(service *Service, editor *Editor) *Handler {
	return &Handler{service: service, editor: editor}
}

// GetMemories handles GET /memories: the memories for the active scope.
func (h *Handler) GetMemories(w http.ResponseWriter, r *http.Request) {
	utils.RespondJSON(w, http.StatusOK, h.service.List())
}

// CreateMemory handles POST /memories {type, scope, title, summary, content}.
func (h *Handler) CreateMemory(w http.ResponseWriter, r *http.Request) {
	var d Draft
	if !utils.DecodeJSON(w, r, &d) {
		return
	}
	if err := h.editor.Create(d); err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, h.service.List())
}

// UpdateMemory handles PUT /memories/{id} {type, title, summary, content}.
func (h *Handler) UpdateMemory(w http.ResponseWriter, r *http.Request) {
	var d Draft
	if !utils.DecodeJSON(w, r, &d) {
		return
	}
	if err := h.editor.Update(r.PathValue("id"), d); err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, h.service.List())
}

// DeleteMemory handles DELETE /memories/{id}.
func (h *Handler) DeleteMemory(w http.ResponseWriter, r *http.Request) {
	if err := h.editor.Delete(r.PathValue("id")); err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, h.service.List())
}
