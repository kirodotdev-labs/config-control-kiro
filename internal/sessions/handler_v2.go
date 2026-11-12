package sessions

import (
	"net/http"

	"kiromanager/internal/shared/utils"
)

// Delete handles POST /sessions/delete with {ids, onlyEmpty}.
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IDs       []string `json:"ids"`
		OnlyEmpty bool     `json:"onlyEmpty"`
	}
	if !utils.DecodeJSON(w, r, &req) {
		return
	}
	res, err := h.service.Delete(req.IDs, req.OnlyEmpty)
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, res)
}
