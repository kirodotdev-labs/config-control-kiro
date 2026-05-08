package utils

import (
	"os"
	"path/filepath"
	"strings"
)

// ValidatePath validates and sanitizes a file path.
// It rejects path traversal attempts and expands home directory references.
func ValidatePath(path string) error {
	// Check for path traversal in raw input before cleaning
	if strings.Contains(path, "..") {
		return NewAppError("Path traversal not allowed", 400, "INVALID_PATH")
	}

	// Expand home directory
	if strings.HasPrefix(path, "~") {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return NewAppError("Cannot determine home directory", 400, "INVALID_PATH")
		}
		if path == "~" {
			path = homeDir
		} else {
			path = filepath.Join(homeDir, path[2:])
		}
	}

	// Clean path
	path = filepath.Clean(path)

	return nil
}

// SanitizeName sanitizes a name (profile, agent, etc.)
func SanitizeName(name string) string {
	// Remove any path separators
	name = strings.ReplaceAll(name, "/", "")
	name = strings.ReplaceAll(name, "\\", "")
	name = strings.ReplaceAll(name, "..", "")
	return strings.TrimSpace(name)
}

// ExpandHomePath expands ~ to home directory
func ExpandHomePath(path string) string {
	if path == "~" || strings.HasPrefix(path, "~/") {
		homeDir, _ := os.UserHomeDir()
		if path == "~" {
			return homeDir
		}
		return filepath.Join(homeDir, path[2:])
	}
	return path
}
