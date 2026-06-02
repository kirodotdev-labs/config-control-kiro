package utils

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
)

// PathResolution describes the result of resolving a user-provided path.
// It tells the caller whether the path is valid, what kind of entry it
// points to, and the canonical filesystem location to use.
type PathResolution struct {
	Valid        bool   `json:"valid"`
	Exists       bool   `json:"exists"`
	Type         string `json:"type"`         // "file" or "directory" when Exists is true
	ResolvedPath string `json:"resolvedPath"` // canonical path on the local filesystem
	ParentPath   string `json:"parentPath"`   // parent directory of ResolvedPath
	Error        string `json:"error"`        // user-friendly error message when Valid is false
}

// windowsPathRegex matches paths starting with a drive letter such as
// "C:\" or "c:/" — the canonical signature of a Windows-style path.
var windowsPathRegex = regexp.MustCompile(`^[A-Za-z]:[\\/]`)

// ResolvePath takes a user-provided path string in any common OS format
// (Linux, macOS, Windows) and resolves it to a canonical path on the
// current filesystem. When isWSL is true, Windows-style paths are
// translated to /mnt/<drive>/... mount points so users can paste a path
// copied from Windows Explorer and have it just work.
//
// The returned PathResolution always populates Error when Valid is false.
// Path-traversal attempts (containing "..") are rejected.
func ResolvePath(input string, isWSL bool) PathResolution {
	// Trim whitespace and any surrounding quotes (common when copy/pasting).
	raw := strings.TrimSpace(input)
	raw = strings.Trim(raw, `"'`)

	if raw == "" {
		return PathResolution{Valid: false, Error: "Path is empty"}
	}

	isWindowsPath := windowsPathRegex.MatchString(raw)

	var translated string
	switch {
	case isWindowsPath && isWSL:
		translated = translateWindowsToWSL(raw)
	case isWindowsPath && runtime.GOOS == "windows":
		// Native Windows — keep the path as-is, only normalizing slashes.
		translated = normalizeSlashes(raw, `\`)
	case isWindowsPath:
		return PathResolution{
			Valid: false,
			Error: "Windows-style paths are only supported when running on Windows or WSL",
		}
	case strings.HasPrefix(raw, "~"):
		translated = ExpandHomePath(raw)
	default:
		translated = raw
	}

	// Reject path traversal attempts in the translated path.
	if strings.Contains(translated, "..") {
		return PathResolution{Valid: false, Error: "Path traversal is not allowed"}
	}

	cleaned := filepath.Clean(translated)

	info, err := os.Stat(cleaned)
	if err != nil {
		if os.IsNotExist(err) {
			return PathResolution{
				Valid:        false,
				Exists:       false,
				ResolvedPath: cleaned,
				Error:        fmt.Sprintf("Path not found: %s", cleaned),
			}
		}
		if os.IsPermission(err) {
			return PathResolution{
				Valid:        false,
				ResolvedPath: cleaned,
				Error:        fmt.Sprintf("Permission denied: %s", cleaned),
			}
		}
		return PathResolution{
			Valid:        false,
			ResolvedPath: cleaned,
			Error:        fmt.Sprintf("Cannot access path: %v", err),
		}
	}

	res := PathResolution{
		Valid:        true,
		Exists:       true,
		ResolvedPath: cleaned,
		ParentPath:   filepath.Dir(cleaned),
	}
	if info.IsDir() {
		res.Type = "directory"
	} else {
		res.Type = "file"
	}
	return res
}

// translateWindowsToWSL converts a Windows-style path (e.g. "C:\Users\name")
// to its WSL mount-point equivalent ("/mnt/c/Users/name"). It also
// normalizes mixed-slash inputs such as "C:\Users\name\/Downloads" to a
// canonical forward-slash form.
func translateWindowsToWSL(winPath string) string {
	if len(winPath) < 2 {
		return winPath
	}

	drive := strings.ToLower(string(winPath[0]))
	rest := winPath[2:] // skip the "X:" prefix

	rest = strings.ReplaceAll(rest, `\`, `/`)
	for strings.Contains(rest, "//") {
		rest = strings.ReplaceAll(rest, "//", "/")
	}
	if !strings.HasPrefix(rest, "/") {
		rest = "/" + rest
	}

	return "/mnt/" + drive + rest
}

// normalizeSlashes collapses runs of the given separator and any opposite-
// direction separators encountered alongside it. Used on Windows to clean
// up mixed-slash paste artefacts before validation.
func normalizeSlashes(path, sep string) string {
	// Convert any forward slashes to the platform separator.
	if sep == `\` {
		path = strings.ReplaceAll(path, "/", `\`)
		for strings.Contains(path, `\\`) {
			// Preserve the leading "C:\" (length-3 prefix).
			if strings.HasPrefix(path, `\\`) {
				break
			}
			path = strings.ReplaceAll(path, `\\`, `\`)
		}
	}
	return path
}
