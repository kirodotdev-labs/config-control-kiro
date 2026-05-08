package utils

import (
	"os"
	"testing"
)

func TestValidatePath_Normal(t *testing.T) {
	if err := ValidatePath("/tmp/test"); err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

func TestValidatePath_Traversal(t *testing.T) {
	err := ValidatePath("/tmp/../etc/passwd")
	if err == nil {
		t.Error("expected error for path traversal, got nil")
	}
}

func TestValidatePath_HomeTilde(t *testing.T) {
	if err := ValidatePath("~/documents"); err != nil {
		t.Errorf("expected no error for ~ path, got %v", err)
	}
}

func TestSanitizeName(t *testing.T) {
	tests := []struct {
		input, expected string
	}{
		{"normal-name", "normal-name"},
		{"path/slash", "pathslash"},
		{"back\\slash", "backslash"},
		{"dots..dots", "dotsdots"},
		{"  spaces  ", "spaces"},
	}
	for _, tt := range tests {
		got := SanitizeName(tt.input)
		if got != tt.expected {
			t.Errorf("SanitizeName(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}

func TestExpandHomePath(t *testing.T) {
	home, _ := os.UserHomeDir()

	tests := []struct {
		input, expected string
	}{
		{"~", home},
		{"~/docs", home + "/docs"},
		{"/absolute/path", "/absolute/path"},
		{"relative/path", "relative/path"},
	}
	for _, tt := range tests {
		got := ExpandHomePath(tt.input)
		if got != tt.expected {
			t.Errorf("ExpandHomePath(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}
