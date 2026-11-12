package utils

import (
	"os"
	"path/filepath"
	"strings"
)

// ValidatePath rejects user-supplied paths that contain a ".." traversal
// segment. It does not modify the path; empty paths are left to the caller.
func ValidatePath(path string) error {
	for _, seg := range strings.FieldsFunc(path, func(r rune) bool { return r == '/' || r == '\\' }) {
		if seg == ".." {
			return BadRequest("Path traversal not allowed", "INVALID_PATH")
		}
	}
	return nil
}

// SanitizeName strips path separators and ".." so a name can be used as a
// single file-name component (agent names, profile names).
func SanitizeName(name string) string {
	name = strings.ReplaceAll(name, "/", "")
	name = strings.ReplaceAll(name, "\\", "")
	name = strings.ReplaceAll(name, "..", "")
	return strings.TrimSpace(name)
}

// ExpandHomePath expands a leading ~ to the user's home directory.
func ExpandHomePath(path string) string {
	if path != "~" && !strings.HasPrefix(path, "~/") {
		return path
	}
	home, _ := os.UserHomeDir()
	if path == "~" {
		return home
	}
	return filepath.Join(home, path[2:])
}
