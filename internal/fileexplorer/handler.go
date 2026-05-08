package fileexplorer

import (
	"encoding/json"
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

// ReadFile handles GET requests to read the contents of a file.
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
	if err != nil {
		utils.RespondError(w, err)
		return
	}

	utils.RespondJSON(w, http.StatusOK, map[string]string{"content": content})
}

// CreateFolder handles POST requests to create a new directory.
func (h *Handler) CreateFolder(w http.ResponseWriter, r *http.Request) {
	var req CreateFolderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.RespondError(w, utils.NewAppError("Invalid request", http.StatusBadRequest, "INVALID_REQUEST"))
		return
	}

	if err := utils.ValidatePath(req.Path); err != nil {
		utils.RespondError(w, err)
		return
	}

	if err := h.service.CreateFolder(req.Path); err != nil {
		utils.RespondError(w, err)
		return
	}

	utils.RespondJSON(w, http.StatusOK, map[string]string{"message": "Folder created"})
}

// CreateFile handles POST requests to create or overwrite a file.
func (h *Handler) CreateFile(w http.ResponseWriter, r *http.Request) {
	var req CreateFileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.RespondError(w, utils.NewAppError("Invalid request", http.StatusBadRequest, "INVALID_REQUEST"))
		return
	}

	if err := utils.ValidatePath(req.Path); err != nil {
		utils.RespondError(w, err)
		return
	}

	if err := h.service.CreateFile(req.Path, req.Content); err != nil {
		utils.RespondError(w, err)
		return
	}

	utils.RespondJSON(w, http.StatusOK, map[string]string{"message": "File created"})
}

// Cut handles POST requests to move a file or directory from source to dest.
func (h *Handler) Cut(w http.ResponseWriter, r *http.Request) {
	var req CutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.RespondError(w, utils.NewAppError("Invalid request", http.StatusBadRequest, "INVALID_REQUEST"))
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

	if err := h.service.Cut(req.Source, req.Dest); err != nil {
		utils.RespondError(w, err)
		return
	}

	utils.RespondJSON(w, http.StatusOK, map[string]string{"message": "Cut successfully"})
}

// Copy handles POST requests to duplicate a file or directory.
func (h *Handler) Copy(w http.ResponseWriter, r *http.Request) {
	var req CopyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.RespondError(w, utils.NewAppError("Invalid request", http.StatusBadRequest, "INVALID_REQUEST"))
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

	if err := h.service.Copy(req.Source, req.Dest); err != nil {
		utils.RespondError(w, err)
		return
	}

	utils.RespondJSON(w, http.StatusOK, map[string]string{"message": "Copied successfully"})
}

// Rename handles POST requests to rename a file or directory.
func (h *Handler) Rename(w http.ResponseWriter, r *http.Request) {
	var req RenameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.RespondError(w, utils.NewAppError("Invalid request", http.StatusBadRequest, "INVALID_REQUEST"))
		return
	}

	if err := utils.ValidatePath(req.Path); err != nil {
		utils.RespondError(w, err)
		return
	}

	if err := h.service.Rename(req.Path, req.NewName); err != nil {
		utils.RespondError(w, err)
		return
	}

	utils.RespondJSON(w, http.StatusOK, map[string]string{"message": "Renamed successfully"})
}

// Delete handles POST requests to remove a file or directory.
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	var req DeleteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.RespondError(w, utils.NewAppError("Invalid request", http.StatusBadRequest, "INVALID_REQUEST"))
		return
	}

	if err := utils.ValidatePath(req.Path); err != nil {
		utils.RespondError(w, err)
		return
	}

	if err := h.service.Delete(req.Path); err != nil {
		utils.RespondError(w, err)
		return
	}

	utils.RespondJSON(w, http.StatusOK, map[string]string{"message": "Deleted successfully"})
}

// BulkCopy handles POST requests to copy multiple sources to a destination.
// Query parameter: resolution (optional, defaults to "overwrite").
func (h *Handler) BulkCopy(w http.ResponseWriter, r *http.Request) {
	var req BulkCopyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.RespondError(w, utils.NewAppError("Invalid request", http.StatusBadRequest, "INVALID_REQUEST"))
		return
	}

	if err := utils.ValidatePath(req.Dest); err != nil {
		utils.RespondError(w, err)
		return
	}
	for _, src := range req.Sources {
		if err := utils.ValidatePath(src); err != nil {
			utils.RespondError(w, err)
			return
		}
	}

	resolution := r.URL.Query().Get("resolution")
	if resolution == "" {
		resolution = "overwrite"
	}
	
	response := h.service.BulkCopy(req.Sources, req.Dest, resolution)
	utils.RespondJSON(w, http.StatusOK, response)
}

// BulkCut handles POST requests to move multiple sources to a destination.
// Query parameter: resolution (optional, defaults to "overwrite").
func (h *Handler) BulkCut(w http.ResponseWriter, r *http.Request) {
	var req BulkCutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.RespondError(w, utils.NewAppError("Invalid request", http.StatusBadRequest, "INVALID_REQUEST"))
		return
	}

	if err := utils.ValidatePath(req.Dest); err != nil {
		utils.RespondError(w, err)
		return
	}
	for _, src := range req.Sources {
		if err := utils.ValidatePath(src); err != nil {
			utils.RespondError(w, err)
			return
		}
	}

	resolution := r.URL.Query().Get("resolution")
	if resolution == "" {
		resolution = "overwrite"
	}
	
	response := h.service.BulkCut(req.Sources, req.Dest, resolution)
	utils.RespondJSON(w, http.StatusOK, response)
}

// BulkDelete handles POST requests to delete multiple files or directories.
func (h *Handler) BulkDelete(w http.ResponseWriter, r *http.Request) {
	var req BulkDeleteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.RespondError(w, utils.NewAppError("Invalid request", http.StatusBadRequest, "INVALID_REQUEST"))
		return
	}

	for _, p := range req.Paths {
		if err := utils.ValidatePath(p); err != nil {
			utils.RespondError(w, err)
			return
		}
	}

	response := h.service.BulkDelete(req.Paths)
	utils.RespondJSON(w, http.StatusOK, response)
}

// CheckConflicts handles POST requests to check which sources would conflict
// with existing entries at the destination.
func (h *Handler) CheckConflicts(w http.ResponseWriter, r *http.Request) {
	var req BulkCopyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.RespondError(w, utils.NewAppError("Invalid request", http.StatusBadRequest, "INVALID_REQUEST"))
		return
	}

	if err := utils.ValidatePath(req.Dest); err != nil {
		utils.RespondError(w, err)
		return
	}
	for _, src := range req.Sources {
		if err := utils.ValidatePath(src); err != nil {
			utils.RespondError(w, err)
			return
		}
	}

	conflicts := h.service.CheckConflicts(req.Sources, req.Dest)
	utils.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"conflicts": conflicts,
	})
}

// GenerateUniqueName handles GET requests to generate a non-conflicting filename.
// Query parameters: basePath (required), name (required).
func (h *Handler) GenerateUniqueName(w http.ResponseWriter, r *http.Request) {
	basePath := r.URL.Query().Get("basePath")
	name := r.URL.Query().Get("name")

	if basePath == "" || name == "" {
		utils.RespondError(w, utils.NewAppError("basePath and name required", http.StatusBadRequest, "INVALID_REQUEST"))
		return
	}

	if err := utils.ValidatePath(basePath); err != nil {
		utils.RespondError(w, err)
		return
	}

	uniqueName := h.service.GenerateUniqueName(basePath, name)
	utils.RespondJSON(w, http.StatusOK, map[string]string{
		"uniqueName": uniqueName,
	})
}
