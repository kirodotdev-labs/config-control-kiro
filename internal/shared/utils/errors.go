// Package utils provides shared HTTP, logging, path and validation helpers.
package utils

import (
	"errors"
	"net/http"
)

// AppError is a structured error carrying an HTTP status and a machine-readable code.
type AppError struct {
	StatusCode int    `json:"statusCode"`
	Code       string `json:"code"`
	Message    string `json:"message"`
	Fix        string `json:"fix,omitempty"`    // what the user can do about it
	Detail     string `json:"detail,omitempty"` // raw tool output, for "copy details"
}

// NewAppError creates an AppError with the given message, HTTP status, and code.
func NewAppError(message string, statusCode int, code string) *AppError {
	return &AppError{StatusCode: statusCode, Code: code, Message: message}
}

// Error implements the error interface.
func (e *AppError) Error() string { return e.Message }

// BadRequest returns a 400 AppError with the given code.
func BadRequest(message, code string) *AppError {
	return NewAppError(message, http.StatusBadRequest, code)
}

// asAppError converts any error to an AppError, defaulting to 500.
func asAppError(err error) *AppError {
	var appErr *AppError
	if errors.As(err, &appErr) {
		return appErr
	}
	return NewAppError(err.Error(), http.StatusInternalServerError, "INTERNAL_ERROR")
}
