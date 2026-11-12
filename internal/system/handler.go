package system

import (
	"kiromanager/internal/shared/utils"
	"net/http"
)

// Handler exposes system-level HTTP endpoints for system info,
// Kiro status, model listing, and workspace management.
type Handler struct {
	service *KiroService
}

// NewHandler creates a Handler backed by the given KiroService.
func NewHandler(service *KiroService) *Handler {
	return &Handler{service: service}
}

// GetSystemInfo returns system information
func (h *Handler) GetSystemInfo(w http.ResponseWriter, r *http.Request) {
	info, err := h.service.GetSystemInfo()
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, info)
}

// GetSurfaces handles GET /system/surfaces: the active scope's configuration
// surfaces (agents, MCP, permissions, hooks, steering, skills, sandbox).
func (h *Handler) GetSurfaces(w http.ResponseWriter, r *http.Request) {
	utils.RespondJSON(w, http.StatusOK, map[string]any{"nodes": h.service.Surfaces()})
}

// GetWorkspaceContext returns current mode, active workspace, and saved workspaces
func (h *Handler) GetWorkspaceContext(w http.ResponseWriter, r *http.Request) {
	utils.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"mode":            h.service.GetMode(),
		"activeWorkspace": h.service.GetActiveWorkspace(),
		"workspaces":      h.service.WorkspaceStatuses(),
		"configPath":      h.service.GetConfigPath(),
	})
}

// SetWorkspaceContext switches between global and workspace mode
func (h *Handler) SetWorkspaceContext(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Mode WorkspaceMode `json:"mode"`
		Path string        `json:"path"`
	}
	if !utils.DecodeJSON(w, r, &req) {
		return
	}
	if err := utils.ValidatePath(req.Path); err != nil {
		utils.RespondError(w, err)
		return
	}
	var err error
	if req.Mode == ModeWorkspace {
		err = h.service.SetWorkspace(req.Path)
	} else {
		err = h.service.SetGlobal()
	}
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"mode":            h.service.GetMode(),
		"activeWorkspace": h.service.GetActiveWorkspace(),
		"configPath":      h.service.GetConfigPath(),
	})
}

// AddWorkspace adds and initializes a new workspace
func (h *Handler) AddWorkspace(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path string `json:"path"`
	}
	if !utils.DecodeJSON(w, r, &req) {
		return
	}
	if err := utils.ValidatePath(req.Path); err != nil {
		utils.RespondError(w, err)
		return
	}
	if err := h.service.AddWorkspace(req.Path); err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"workspaces": h.service.WorkspaceStatuses(),
	})
}

// RemoveWorkspace removes a workspace from the saved list
func (h *Handler) RemoveWorkspace(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path string `json:"path"`
	}
	if !utils.DecodeJSON(w, r, &req) {
		return
	}
	if err := utils.ValidatePath(req.Path); err != nil {
		utils.RespondError(w, err)
		return
	}
	if err := h.service.RemoveWorkspace(req.Path); err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"workspaces": h.service.WorkspaceStatuses(),
		"mode":       h.service.GetMode(),
	})
}
