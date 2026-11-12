package system

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// workspaceRootHash is the directory name Kiro CLI V3 uses under
// <global>/workspace-roots/ for a workspace's out-of-repo permissions file.
// It mirrors kiro-cli's own identity rule (tui.js: qg/Qg/GS): the folder's
// real path with symlinks resolved, forward slashes, "." and ".." removed,
// no trailing slash, lowercased on Windows, then the first 16 hex digits of
// its SHA-256. (Windows folders with per-directory case sensitivity use a
// different "case-exact" key in Kiro; those are not handled here.)
func workspaceRootHash(workspacePath string) string {
	return hashRoot(workspaceRoot(realPath(workspacePath), runtime.GOOS))
}

func hashRoot(root string) string {
	sum := sha256.Sum256([]byte(root))
	return hex.EncodeToString(sum[:])[:16]
}

// realPath resolves symlinks like Node's realpath. For a path that doesn't
// exist yet it resolves the deepest existing parent and keeps the rest.
func realPath(p string) string {
	abs, err := filepath.Abs(p)
	if err != nil {
		return p
	}
	var rest []string
	cur := abs
	for {
		if r, err := filepath.EvalSymlinks(cur); err == nil {
			out := r
			for i := len(rest) - 1; i >= 0; i-- {
				out = filepath.Join(out, rest[i])
			}
			return out
		}
		parent := filepath.Dir(cur)
		if parent == cur {
			return abs
		}
		rest = append(rest, filepath.Base(cur))
		cur = parent
	}
}

// workspaceRoot normalizes a real path the way Kiro does before hashing.
func workspaceRoot(p, goos string) string {
	windows := goos == "windows"
	if windows {
		p = strings.TrimPrefix(p, `\\?\`)
	}
	s := strings.ReplaceAll(p, `\`, "/")
	unc := windows && strings.HasPrefix(s, "//")
	n := normalizeSlashPath(s)
	if unc && !strings.HasPrefix(n, "//") {
		n = "/" + n
	}
	if len(n) > 1 {
		trimmed := strings.TrimRight(n, "/")
		drive := len(trimmed) == 2 && trimmed[1] == ':'
		if trimmed != "" && !drive {
			n = trimmed
		}
	}
	if windows {
		n = strings.ToLower(n)
	}
	return n
}

// normalizeSlashPath is POSIX path normalization that keeps a trailing slash.
func normalizeSlashPath(p string) string {
	if p == "" {
		return "."
	}
	absolute := strings.HasPrefix(p, "/")
	trailing := strings.HasSuffix(p, "/")
	var parts []string
	for _, seg := range strings.Split(p, "/") {
		switch seg {
		case "", ".":
		case "..":
			if len(parts) > 0 && parts[len(parts)-1] != ".." {
				parts = parts[:len(parts)-1]
			} else if !absolute {
				parts = append(parts, "..")
			}
		default:
			parts = append(parts, seg)
		}
	}
	out := strings.Join(parts, "/")
	if out == "" {
		if absolute {
			return "/"
		}
		if trailing {
			return "./"
		}
		return "."
	}
	if trailing {
		out += "/"
	}
	if absolute {
		out = "/" + out
	}
	return out
}

// ActiveWorkspaceIsHome reports whether the active Workspace is the user's
// home folder. Kiro never saves trust for home and asks at every launch.
func (s *KiroService) ActiveWorkspaceIsHome() bool {
	sc := s.snapshot()
	if sc.mode != ModeWorkspace || sc.activeWorkspace == "" {
		return false
	}
	home, err := os.UserHomeDir()
	return err == nil && workspaceRoot(realPath(home), runtime.GOOS) == workspaceRoot(realPath(sc.activeWorkspace), runtime.GOOS)
}
