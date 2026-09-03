package performance

import (
	"net/http"
	"strconv"

	"kiromanager/internal/shared/utils"
)

// Handler provides HTTP handlers for the performance endpoints.
type Handler struct {
	service *Service
}

// NewHandler creates a new Handler backed by the given performance Service.
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// GetSummary handles GET /api/performance/summary.
// Query parameters:
//   - window: one of "24h", "7d", "30d", "all" (default "24h").
func (h *Handler) GetSummary(w http.ResponseWriter, r *http.Request) {
	window := r.URL.Query().Get("window")
	summary, err := h.service.ReadSummary(window)
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, summary)
}

// GetRecent handles GET /api/performance/recent.
// Query parameters:
//   - window: one of "24h", "7d", "30d", "all" (default "24h").
//   - limit:  max rows to return, 1-1000 (default 200).
func (h *Handler) GetRecent(w http.ResponseWriter, r *http.Request) {
	window := r.URL.Query().Get("window")
	limit := 200
	if v := r.URL.Query().Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 1000 {
			utils.RespondError(w, utils.NewAppError("limit must be between 1 and 1000", 400, "INVALID_LIMIT"))
			return
		}
		limit = n
	}
	turns, err := h.service.ReadRecent(window, limit)
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, map[string]interface{}{"turns": turns})
}


// GetKiroUsage handles GET /api/performance/kiro-usage.
// Fetches live from `kiro-cli chat --no-interactive "/usage"` on each request
// (no caching) and returns the parsed plan-and-credits snapshot.
func (h *Handler) GetKiroUsage(w http.ResponseWriter, r *http.Request) {
	usage, err := h.service.ReadKiroUsage()
	if err != nil {
		utils.RespondError(w, utils.NewAppError(err.Error(), 502, "KIRO_USAGE_UNAVAILABLE"))
		return
	}
	utils.RespondJSON(w, http.StatusOK, usage)
}
