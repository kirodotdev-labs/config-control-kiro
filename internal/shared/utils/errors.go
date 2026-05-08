package utils

import (
	"encoding/json"
	"net/http"
)

// NewAppError creates an AppError with the given message, HTTP status code, and error code.
func NewAppError(message string, statusCode int, code string) *AppError {
	return &AppError{
		StatusCode: statusCode,
		Code:       code,
		Message:    message,
	}
}

// AppError is a structured error carrying an HTTP status code and machine-readable code.
type AppError struct {
	StatusCode int    `json:"statusCode"`
	Code       string `json:"code"`
	Message    string `json:"message"`
}

// Error implements the error interface.
func (e *AppError) Error() string {
	return e.Message
}

// RespondError writes a JSON error response. If err is an AppError its status and code are used;
// otherwise a 500 Internal Server Error is returned.
func RespondError(w http.ResponseWriter, err error) {
	var appErr *AppError
	if e, ok := err.(*AppError); ok {
		appErr = e
	} else {
		appErr = &AppError{
			StatusCode: 500,
			Code:       "INTERNAL_ERROR",
			Message:    err.Error(),
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(appErr.StatusCode)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"error": appErr.Message,
		"code":  appErr.Code,
	})
}

// RespondJSON writes a JSON response with the given status code and data.
func RespondJSON(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(data)
}
