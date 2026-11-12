package agent

import (
	"net/http"

	"kiromanager/internal/shared/utils"
)

// Kiro's upgrade of 2.x agent configs to V3 exists only for 2.x.

// PreviewUpgrade handles POST /agents/{name}/upgrade/preview.
func (h *Handler) PreviewUpgrade(w http.ResponseWriter, r *http.Request) {
	prev, err := h.service.PreviewUpgrade(r.PathValue("name"))
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, prev)
}

// ApplyUpgrade handles POST /agents/{name}/upgrade with {hash} from the preview.
func (h *Handler) ApplyUpgrade(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Hash string `json:"hash"`
	}
	if !utils.DecodeJSON(w, r, &req) {
		return
	}
	backup, err := h.service.ApplyUpgrade(r.PathValue("name"), req.Hash)
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, map[string]string{"backup": backup})
}

// RestoreBackup handles POST /agents/{name}/restore.
func (h *Handler) RestoreBackup(w http.ResponseWriter, r *http.Request) {
	if err := h.service.RestoreBackup(r.PathValue("name")); err != nil {
		utils.RespondError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// UpgradeScope handles POST /agents/upgrade-all with {dryRun}.
func (h *Handler) UpgradeScope(w http.ResponseWriter, r *http.Request) {
	var req struct {
		DryRun bool `json:"dryRun"`
	}
	if !utils.DecodeJSON(w, r, &req) {
		return
	}
	out, err := h.service.UpgradeScope(req.DryRun)
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, map[string]string{"output": out})
}
