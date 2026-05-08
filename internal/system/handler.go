package system

import (
	"encoding/json"
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

// GetKiroStatus returns Kiro CLI status
func (h *Handler) GetKiroStatus(w http.ResponseWriter, r *http.Request) {
	status, err := h.service.GetKiroStatus()
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, status)
}

// GetKiroModels returns available Kiro models
func (h *Handler) GetKiroModels(w http.ResponseWriter, r *http.Request) {
	models, err := h.service.GetKiroModels()
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, models)
}

// GetWorkspaceContext returns current mode, active workspace, and saved workspaces
func (h *Handler) GetWorkspaceContext(w http.ResponseWriter, r *http.Request) {
	utils.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"mode":            h.service.GetMode(),
		"activeWorkspace": h.service.GetActiveWorkspace(),
		"workspaces":      h.service.GetWorkspaces(),
		"configPath":      h.service.GetConfigPath(),
	})
}

// SetWorkspaceContext switches between global and workspace mode
func (h *Handler) SetWorkspaceContext(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Mode WorkspaceMode `json:"mode"`
		Path string        `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
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
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.RespondError(w, err)
		return
	}
	if err := h.service.AddWorkspace(req.Path); err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"workspaces": h.service.GetWorkspaces(),
	})
}

// RemoveWorkspace removes a workspace from the saved list
func (h *Handler) RemoveWorkspace(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.RespondError(w, err)
		return
	}
	if err := h.service.RemoveWorkspace(req.Path); err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"workspaces": h.service.GetWorkspaces(),
		"mode":       h.service.GetMode(),
	})
}

// AddExistingWorkspace adds a workspace only if .kiro already exists at the path.
func (h *Handler) AddExistingWorkspace(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.RespondError(w, utils.NewAppError("Invalid request", 400, "INVALID_REQUEST"))
		return
	}
	if err := utils.ValidatePath(req.Path); err != nil {
		utils.RespondError(w, err)
		return
	}
	if err := h.service.AddExistingWorkspace(req.Path); err != nil {
		utils.RespondError(w, utils.NewAppError(err.Error(), 400, "WORKSPACE_NOT_FOUND"))
		return
	}
	utils.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"success":    true,
		"workspaces": h.service.ListWorkspacesWithStats(),
	})
}

// ListWorkspaces returns all workspaces with content stats.
func (h *Handler) ListWorkspaces(w http.ResponseWriter, r *http.Request) {
	utils.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"workspaces": h.service.ListWorkspacesWithStats(),
		"mode":       h.service.GetMode(),
		"active":     h.service.GetActiveWorkspace(),
	})
}

// DeleteWorkspace removes the .kiro directory and the workspace from the list.
func (h *Handler) DeleteWorkspace(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.RespondError(w, utils.NewAppError("Invalid request", 400, "INVALID_REQUEST"))
		return
	}
	if err := utils.ValidatePath(req.Path); err != nil {
		utils.RespondError(w, err)
		return
	}
	if err := h.service.DeleteWorkspace(req.Path); err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"success":    true,
		"workspaces": h.service.ListWorkspacesWithStats(),
	})
}

// CopyWorkspace copies .kiro from one project to another.
func (h *Handler) CopyWorkspace(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Source string `json:"source"`
		Dest   string `json:"dest"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.RespondError(w, utils.NewAppError("Invalid request", 400, "INVALID_REQUEST"))
		return
	}
	if err := utils.ValidatePath(req.Source); err != nil {
		utils.RespondError(w, err)
		return
	}
	if err := utils.ValidatePath(req.Dest); err != nil {
		utils.RespondError(w, err)
		return
	}
	if err := h.service.CopyWorkspace(req.Source, req.Dest); err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"success":    true,
		"workspaces": h.service.ListWorkspacesWithStats(),
	})
}

// MoveWorkspace moves .kiro from one project to another and updates the list.
func (h *Handler) MoveWorkspace(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Source string `json:"source"`
		Dest   string `json:"dest"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.RespondError(w, utils.NewAppError("Invalid request", 400, "INVALID_REQUEST"))
		return
	}
	if err := utils.ValidatePath(req.Source); err != nil {
		utils.RespondError(w, err)
		return
	}
	if err := utils.ValidatePath(req.Dest); err != nil {
		utils.RespondError(w, err)
		return
	}
	if err := h.service.MoveWorkspace(req.Source, req.Dest); err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"success":    true,
		"workspaces": h.service.ListWorkspacesWithStats(),
	})
}

// CheckForUpdate returns the current version and whether an update is available.
func (h *Handler) CheckForUpdate(w http.ResponseWriter, r *http.Request) {
	utils.RespondJSON(w, http.StatusOK, h.service.CheckForUpdate())
}
