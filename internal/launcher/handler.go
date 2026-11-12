package launcher

import (
	"errors"
	"net/http"

	"kiromanager/internal/shared/utils"
)

// Handler exposes terminal launching over HTTP.
type Handler struct {
	service *Service
}

// NewHandler creates a Handler backed by service.
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// LaunchRequest is the payload for POST /launcher/launch.
type LaunchRequest struct {
	Directory string `json:"directory"`
	Command   string `json:"command"`
}

// Launch handles POST /launcher/launch: opens a terminal running a kiro-cli command.
func (h *Handler) Launch(w http.ResponseWriter, r *http.Request) {
	var req LaunchRequest
	if !utils.DecodeJSON(w, r, &req) {
		return
	}
	if err := ValidateCommand(req.Command); err != nil {
		utils.RespondError(w, utils.NewAppError(err.Error(), http.StatusBadRequest, "COMMAND_NOT_ALLOWED"))
		return
	}
	if err := h.service.Launch(req.Directory, req.Command); err != nil {
		if errors.Is(err, ErrDirectoryNotFound) {
			utils.RespondError(w, utils.NewAppError(err.Error(), http.StatusBadRequest, "DIRECTORY_NOT_FOUND"))
			return
		}
		utils.RespondError(w, utils.NewAppError(err.Error(), http.StatusInternalServerError, "LAUNCH_FAILED"))
		return
	}
	utils.RespondJSON(w, http.StatusOK, map[string]string{"status": "launched"})
}
