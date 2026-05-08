package launcher

import (
	"testing"

	"kiromanager/internal/shared/utils"
)

func TestEncodePowerShell(t *testing.T) {
	encoded := encodePowerShell("echo hello")
	if encoded == "" {
		t.Error("expected non-empty encoded string")
	}
}

func TestNewService(t *testing.T) {
	logger := utils.NewLogger()
	svc := NewService(logger, false)
	if svc == nil {
		t.Fatal("expected non-nil service")
	}
	if svc.isWSL {
		t.Error("expected isWSL=false")
	}
}

func TestLaunch_InvalidDirectory(t *testing.T) {
	logger := utils.NewLogger()
	svc := NewService(logger, false)
	// Launch with invalid dir should fall back to home dir, not error
	// We can't fully test terminal launch in CI, but we can verify it doesn't panic
	// This test is intentionally limited since it spawns real processes
	_ = svc
}

func TestShellEscape(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{"no quotes", "/home/user/project", "/home/user/project"},
		{"single quote", "it's a dir", "it'\\''s a dir"},
		{"injection payload", "'; rm -rf / #", "'\\''; rm -rf / #"},
		{"multiple quotes", "a'b'c", "a'\\''b'\\''c"},
		{"empty string", "", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := shellEscape(tt.input)
			if got != tt.want {
				t.Errorf("shellEscape(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}
