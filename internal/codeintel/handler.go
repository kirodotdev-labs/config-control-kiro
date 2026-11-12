package codeintel

import (
	"net/http"
	"strings"

	"kiromanager/internal/shared/utils"
)

// Handler provides the HTTP handler for code intelligence setup.
type Handler struct {
	service *Service
}

// NewHandler creates a codeintel Handler.
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// GetInfo handles GET /codeintel?commands=gopls,clangd: detected languages
// and which commands are installed.
func (h *Handler) GetInfo(w http.ResponseWriter, r *http.Request) {
	var cmds []string
	if c := r.URL.Query().Get("commands"); c != "" {
		cmds = strings.Split(c, ",")
	}
	if len(cmds) > 50 {
		cmds = cmds[:50]
	}
	utils.RespondJSON(w, http.StatusOK, h.service.Info(cmds))
}
