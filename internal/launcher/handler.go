package launcher

import (
	"encoding/json"
	"net/http"
	"strings"

	"kiromanager/internal/shared/utils"
)

// Handler provides HTTP handlers for terminal launching.
type Handler struct {
	service *Service
}

// NewHandler creates a new Handler backed by the given launcher Service.
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// LaunchRequest is the request payload for launching a terminal.
type LaunchRequest struct {
	Directory string `json:"directory"`
	Command   string `json:"command"`
}

// Launch handles POST requests to open a native terminal and run a command.
func (h *Handler) Launch(w http.ResponseWriter, r *http.Request) {
	var req LaunchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.RespondError(w, utils.NewAppError("Invalid request body", http.StatusBadRequest, "INVALID_REQUEST"))
		return
	}

	if req.Command == "" {
		utils.RespondError(w, utils.NewAppError("Command is required", http.StatusBadRequest, "MISSING_COMMAND"))
		return
	}

	if !strings.HasPrefix(req.Command, "kiro-cli ") && req.Command != "kiro-cli" {
		utils.RespondError(w, utils.NewAppError("Command not allowed", http.StatusBadRequest, "COMMAND_NOT_ALLOWED"))
		return
	}

	if err := h.service.Launch(req.Directory, req.Command); err != nil {
		utils.RespondError(w, err)
		return
	}

	utils.RespondJSON(w, http.StatusOK, map[string]string{"status": "launched"})
}
