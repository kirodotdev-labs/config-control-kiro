package update

import (
	"net/http"

	"kiromanager/internal/shared/utils"
)

// Handler serves the updater's API.
type Handler struct{ u *Updater }

// NewHandler creates an update Handler.
func NewHandler(u *Updater) *Handler { return &Handler{u: u} }

// Get handles GET /update: the current state.
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	utils.RespondJSON(w, http.StatusOK, h.u.Status())
}

// Check handles POST /update/check: look for a newer release now.
func (h *Handler) Check(w http.ResponseWriter, r *http.Request) {
	utils.RespondJSON(w, http.StatusOK, h.u.Check())
}

// Apply handles POST /update/apply: install the downloaded update and restart
// into it. It answers before the restart; the page reconnects by itself.
func (h *Handler) Apply(w http.ResponseWriter, r *http.Request) {
	if s := h.u.Status(); s.State != StateReady {
		utils.RespondError(w, utils.NewAppError("No update is ready to install.", http.StatusConflict, "NOT_READY"))
		return
	}
	utils.RespondJSON(w, http.StatusAccepted, map[string]string{"state": StateApplying})
	go func() { _ = h.u.Apply() }()
}

// Settings handles POST /update/settings {auto}.
func (h *Handler) Settings(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Auto bool `json:"auto"`
	}
	if !utils.DecodeJSON(w, r, &req) {
		return
	}
	if err := h.u.SetAuto(req.Auto); err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, h.u.Status())
}
