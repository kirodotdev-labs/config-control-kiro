package sessions

import (
	"net/http"

	"kiromanager/internal/shared/utils"
)

// Handler exposes chats, usage and chat tags over HTTP.
type Handler struct{ service *Service }

// NewHandler creates a Handler backed by service.
func NewHandler(service *Service) *Handler { return &Handler{service: service} }

// Overview handles GET /sessions: ?refresh=1 re-asks kiro-cli, ?folder=
// keeps chats started in that folder (a Workspace) or below it.
func (h *Handler) Overview(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	utils.RespondJSON(w, http.StatusOK, h.service.Overview(q.Get("refresh") == "1", q.Get("folder")))
}

// Running handles GET /sessions/running: the fast open-chats check.
func (h *Handler) Running(w http.ResponseWriter, r *http.Request) {
	utils.RespondJSON(w, http.StatusOK, h.service.Running())
}

// SetTags handles PUT /sessions/{id}/tags with {tags}.
func (h *Handler) SetTags(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Tags []string `json:"tags"`
	}
	if !utils.DecodeJSON(w, r, &req) {
		return
	}
	tags, err := h.service.SetTags(r.PathValue("id"), req.Tags)
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, map[string][]string{"tags": tags})
}

// RenameTag handles POST /sessions/tags/rename with {from, to}; an empty to deletes the tag.
func (h *Handler) RenameTag(w http.ResponseWriter, r *http.Request) {
	var req struct {
		From string `json:"from"`
		To   string `json:"to"`
	}
	if !utils.DecodeJSON(w, r, &req) {
		return
	}
	if err := h.service.RenameTag(req.From, req.To); err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
