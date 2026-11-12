package fileexplorer

import (
	"encoding/json"
	"errors"
	"net/http"

	"kiromanager/internal/shared/utils"
)

// Handler provides HTTP handlers for file explorer operations.
type Handler struct {
	service *FileExplorerService
}

// NewHandler creates a new Handler backed by the given FileExplorerService.
func NewHandler(service *FileExplorerService) *Handler {
	return &Handler{
		service: service,
	}
}

// Browse handles GET requests to list files and folders at a given path.
// Query parameters: path (required), filter (optional JSON array or single extension).
func (h *Handler) Browse(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		utils.RespondError(w, utils.NewAppError("path is required", http.StatusBadRequest, "INVALID_REQUEST"))
		return
	}
	if err := utils.ValidatePath(path); err != nil {
		utils.RespondError(w, err)
		return
	}

	filterParam := r.URL.Query().Get("filter")
	var filter []string
	if filterParam != "" {
		if err := json.Unmarshal([]byte(filterParam), &filter); err != nil {
			filter = []string{filterParam} // Single filter
		}
	}

	result, err := h.service.Browse(path, filter)
	if err != nil {
		utils.RespondError(w, err)
		return
	}

	utils.RespondJSON(w, http.StatusOK, result)
}

// ReadFile handles GET /fileexplorer/read?path=…: {content, exists}. With
// optional=1 a missing file answers {content: "", exists: false} instead of 404.
// Query parameter: path (required).
func (h *Handler) ReadFile(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		utils.RespondError(w, utils.NewAppError("path is required", http.StatusBadRequest, "INVALID_REQUEST"))
		return
	}
	if err := utils.ValidatePath(path); err != nil {
		utils.RespondError(w, err)
		return
	}

	content, err := h.service.ReadFile(path)
	var appErr *utils.AppError
	if err != nil && r.URL.Query().Get("optional") == "1" && errors.As(err, &appErr) && appErr.Code == "FILE_NOT_FOUND" {
		// A file that may not exist yet (e.g. the Global cli.json, read from a Workspace).
		utils.RespondJSON(w, http.StatusOK, map[string]any{"content": "", "exists": false})
		return
	}
	if err != nil {
		utils.RespondError(w, err)
		return
	}

	utils.RespondJSON(w, http.StatusOK, map[string]any{"content": content, "exists": true})
}

// CreateFile handles POST requests to create or overwrite a file.
func (h *Handler) CreateFile(w http.ResponseWriter, r *http.Request) {
	var req CreateFileRequest
	if !utils.DecodeJSON(w, r, &req) {
		return
	}

	if err := utils.ValidatePath(req.Path); err != nil {
		utils.RespondError(w, err)
		return
	}

	if err := h.service.CreateFile(req.Path, req.Content, req.CreateOnly); err != nil {
		utils.RespondError(w, err)
		return
	}

	utils.RespondJSON(w, http.StatusOK, map[string]string{"path": utils.ExpandHomePath(req.Path)})
}

// CopyFile handles POST /fileexplorer/copy {source, dest, overwrite}: an
// existing file copied into a skill or power folder.
func (h *Handler) CopyFile(w http.ResponseWriter, r *http.Request) {
	var req CopyFileRequest
	if !utils.DecodeJSON(w, r, &req) {
		return
	}
	for _, p := range []string{req.Source, req.Dest} {
		if err := utils.ValidatePath(p); err != nil {
			utils.RespondError(w, err)
			return
		}
	}
	if err := h.service.CopyFile(req.Source, req.Dest, req.Overwrite); err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, map[string]string{"path": utils.ExpandHomePath(req.Dest)})
}

// DeleteFile handles DELETE /fileexplorer/file?path=... — removes a file in a
// deletable folder, or a skill or spec folder.
func (h *Handler) DeleteFile(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		utils.RespondError(w, utils.BadRequest("path is required", "MISSING_PATH"))
		return
	}
	if err := utils.ValidatePath(path); err != nil {
		utils.RespondError(w, err)
		return
	}
	if err := h.service.Delete(path); err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// ResolvePath handles POST requests that validate and translate a
// user-provided path. The body is a JSON object with a "path" field that
// may be a Linux, macOS or Windows-style path. The response is a
// PathResolution describing whether the path is valid, what it points to,
// and the canonical filesystem location to navigate to.
//
// This endpoint always returns HTTP 200 — invalid paths are reported
// inside the response body so the frontend can show a helpful error
// without being treated as a request failure.
func (h *Handler) ResolvePath(w http.ResponseWriter, r *http.Request) {
	var req ResolvePathRequest
	if !utils.DecodeJSON(w, r, &req) {
		return
	}

	resolution := h.service.ResolvePath(req.Path)
	utils.RespondJSON(w, http.StatusOK, resolution)
}
