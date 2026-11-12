// Package browser opens a URL in the user's default web browser using only
// the standard library (no third-party dependency).
package browser

import (
	"fmt"
	"os/exec"
	"runtime"
)

// Open launches the default browser at url. isWSL selects the Windows host
// browser when running inside WSL.
func Open(url string, isWSL bool) error {
	name, args, err := command(runtime.GOOS, isWSL, url)
	if err != nil {
		return err
	}
	cmd := exec.Command(name, args...)
	if err := cmd.Start(); err != nil {
		return err
	}
	go func() { _ = cmd.Wait() }()
	return nil
}

// command returns the program and arguments that open url on goos.
func command(goos string, isWSL bool, url string) (string, []string, error) {
	switch {
	case goos == "windows":
		return "rundll32", []string{"url.dll,FileProtocolHandler", url}, nil
	case isWSL:
		return "cmd.exe", []string{"/c", "start", "", url}, nil
	case goos == "darwin":
		return "open", []string{url}, nil
	case goos == "linux" || goos == "freebsd" || goos == "openbsd" || goos == "netbsd":
		return "xdg-open", []string{url}, nil
	default:
		return "", nil, fmt.Errorf("unsupported platform %q", goos)
	}
}
