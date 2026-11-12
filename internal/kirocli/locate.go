// Package kirocli runs the kiro-cli binary on the user's machine and turns
// every outcome into something the app can explain: a result, or a Problem
// with a plain message and a fix. All kiro-cli calls go through it.
package kirocli

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

// PathEnv overrides where kiro-cli is found (an absolute path to the binary).
const PathEnv = "CCKIRO_KIRO_CLI"

// Locate returns the kiro-cli binary, or "" when it is not installed. Apps
// started from Finder or a desktop shortcut get a minimal PATH, so the
// documented install locations are checked before PATH.
func Locate() string {
	if p := os.Getenv(PathEnv); p != "" {
		if isFile(p) {
			return p
		}
		return ""
	}
	name := "kiro-cli"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	home, _ := os.UserHomeDir()
	candidates := []string{filepath.Join(home, ".local", "bin", name)}
	switch runtime.GOOS {
	case "darwin":
		candidates = append(candidates, "/opt/homebrew/bin/"+name, "/usr/local/bin/"+name)
	case "linux":
		candidates = append(candidates, "/usr/local/bin/"+name, "/usr/bin/"+name)
	case "windows":
		if local := os.Getenv("LOCALAPPDATA"); local != "" {
			candidates = append(candidates, filepath.Join(local, "Programs", "kiro-cli", name), filepath.Join(local, "kiro-cli", name))
		}
	}
	for _, c := range candidates {
		if isFile(c) {
			return c
		}
	}
	if p, err := exec.LookPath(name); err == nil {
		return p
	}
	return ""
}

func isFile(p string) bool {
	info, err := os.Stat(p)
	return err == nil && !info.IsDir()
}
