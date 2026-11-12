package utils

import (
	"encoding/json"
	"errors"
	"net/http"
)

// RespondJSON writes data as JSON with the given status code.
func RespondJSON(w http.ResponseWriter, statusCode int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(data)
}

// RespondError writes a JSON error body {error, code}. AppErrors keep their
// status and code; any other error becomes a 500.
func RespondError(w http.ResponseWriter, err error) {
	appErr := asAppError(err)
	body := map[string]string{"error": appErr.Message, "code": appErr.Code}
	if appErr.Fix != "" {
		body["fix"] = appErr.Fix
	}
	if appErr.Detail != "" {
		body["detail"] = appErr.Detail
	}
	RespondJSON(w, appErr.StatusCode, body)
}

// DecodeJSON decodes the request body into v. On failure it writes a 400 (or
// 413 when the body exceeds the size limit) and returns false; callers return.
func DecodeJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	err := json.NewDecoder(r.Body).Decode(v)
	if err == nil {
		return true
	}
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		RespondError(w, NewAppError("Request body too large", http.StatusRequestEntityTooLarge, "BODY_TOO_LARGE"))
	} else {
		RespondError(w, BadRequest("Invalid JSON request body", "INVALID_REQUEST"))
	}
	return false
}
