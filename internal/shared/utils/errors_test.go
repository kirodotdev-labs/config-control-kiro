package utils

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNewAppError(t *testing.T) {
	err := NewAppError("not found", 404, "NOT_FOUND")
	if err.Message != "not found" {
		t.Errorf("expected message 'not found', got %q", err.Message)
	}
	if err.StatusCode != 404 {
		t.Errorf("expected status 404, got %d", err.StatusCode)
	}
	if err.Code != "NOT_FOUND" {
		t.Errorf("expected code 'NOT_FOUND', got %q", err.Code)
	}
}

func TestAppError_Error(t *testing.T) {
	err := NewAppError("something broke", 500, "INTERNAL")
	if err.Error() != "something broke" {
		t.Errorf("expected 'something broke', got %q", err.Error())
	}
}

func TestRespondJSON(t *testing.T) {
	w := httptest.NewRecorder()
	data := map[string]string{"key": "value"}
	RespondJSON(w, http.StatusOK, data)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	if ct := w.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("expected application/json, got %q", ct)
	}
	var result map[string]string
	json.NewDecoder(w.Body).Decode(&result)
	if result["key"] != "value" {
		t.Errorf("expected 'value', got %q", result["key"])
	}
}

func TestRespondError_AppError(t *testing.T) {
	w := httptest.NewRecorder()
	err := NewAppError("bad request", 400, "BAD_REQ")
	RespondError(w, err)

	if w.Code != 400 {
		t.Errorf("expected 400, got %d", w.Code)
	}
	var result map[string]string
	json.NewDecoder(w.Body).Decode(&result)
	if result["error"] != "bad request" {
		t.Errorf("expected 'bad request', got %q", result["error"])
	}
	if result["code"] != "BAD_REQ" {
		t.Errorf("expected 'BAD_REQ', got %q", result["code"])
	}
}

func TestRespondError_GenericError(t *testing.T) {
	w := httptest.NewRecorder()
	RespondError(w, fmt.Errorf("generic failure"))

	if w.Code != 500 {
		t.Errorf("expected 500, got %d", w.Code)
	}
	var result map[string]string
	json.NewDecoder(w.Body).Decode(&result)
	if result["code"] != "INTERNAL_ERROR" {
		t.Errorf("expected 'INTERNAL_ERROR', got %q", result["code"])
	}
}

