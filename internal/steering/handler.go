package steering

import (
	"encoding/json"
	"net/http"
	"strings"

	"kiromanager/internal/shared/utils"
)

// Handler provides HTTP handlers for steering file management.
type Handler struct {
	service *Service
}

// NewHandler creates a new Handler backed by the given steering Service.
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// GetFiles handles GET requests to list all steering markdown files.
func (h *Handler) GetFiles(w http.ResponseWriter, r *http.Request) {
	files, err := h.service.GetFiles()
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, map[string]interface{}{"files": files})
}

// validateFilename rejects filenames containing path separators or traversal sequences.
func validateFilename(name string) error {
	if strings.ContainsAny(name, "/\\") || strings.Contains(name, "..") {
		return utils.NewAppError("Invalid filename", 400, "INVALID_FILENAME")
	}
	return nil
}

// GetFileContent handles GET requests to read the content of a steering file.
// Query parameter: file (required).
func (h *Handler) GetFileContent(w http.ResponseWriter, r *http.Request) {
	filename := r.URL.Query().Get("file")
	if filename == "" {
		utils.RespondError(w, utils.NewAppError("file parameter required", 400, "MISSING_PARAM"))
		return
	}
	if err := validateFilename(filename); err != nil {
		utils.RespondError(w, err)
		return
	}

	content, err := h.service.GetFileContent(filename)
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, map[string]interface{}{"content": content})
}

// SaveFile handles POST requests to create or update a steering file.
func (h *Handler) SaveFile(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Filename string `json:"filename"`
		Content  string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.RespondError(w, err)
		return
	}
	if err := validateFilename(req.Filename); err != nil {
		utils.RespondError(w, err)
		return
	}
	if err := h.service.SaveFile(req.Filename, req.Content); err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

// DeleteFile handles DELETE requests to remove a steering file.
// Query parameter: file (required).
func (h *Handler) DeleteFile(w http.ResponseWriter, r *http.Request) {
	filename := r.URL.Query().Get("file")
	if filename == "" {
		utils.RespondError(w, utils.NewAppError("file parameter required", 400, "MISSING_PARAM"))
		return
	}
	if err := validateFilename(filename); err != nil {
		utils.RespondError(w, err)
		return
	}
	if err := h.service.DeleteFile(filename); err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}
