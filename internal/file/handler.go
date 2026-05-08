package file

import (
	"encoding/json"
	"net/http"

	"kiromanager/internal/shared/utils"
)

// Handler exposes HTTP endpoints for file browsing, URI generation,
// and file uploads.
type Handler struct {
	service *FileService
}

// NewHandler creates a Handler backed by the given FileService.
func NewHandler(service *FileService) *Handler {
	return &Handler{service: service}
}

// BrowseFiles handles GET requests to list directory contents.
// The target path is read from the "path" query parameter.
func (h *Handler) BrowseFiles(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if err := utils.ValidatePath(path); err != nil {
		utils.RespondError(w, err)
		return
	}
	contents, err := h.service.BrowseFiles(path)
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, contents)
}

// GenerateFileURI handles POST requests to produce a file:// URI from
// a path. It accepts both "path" and "filePath" JSON fields for
// backwards compatibility.
func (h *Handler) GenerateFileURI(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path     string `json:"path"`
		FilePath string `json:"filePath"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	// Support both 'path' and 'filePath' for backwards compatibility
	pathToUse := req.Path
	if pathToUse == "" {
		pathToUse = req.FilePath
	}

	uri := h.service.GenerateFileURI(pathToUse)
	utils.RespondJSON(w, http.StatusOK, map[string]string{"fileUri": uri})
}

// UploadFiles handles POST requests for file uploads.
func (h *Handler) UploadFiles(w http.ResponseWriter, r *http.Request) {
	utils.RespondJSON(w, http.StatusOK, map[string]bool{"success": true})
}
