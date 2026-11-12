//go:build !windows

package sessions

import (
	"errors"
	"syscall"
)

// processAlive reports whether a process with pid exists. Signal 0 checks
// without sending anything; EPERM means it exists but belongs to someone else.
func processAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	err := syscall.Kill(pid, 0)
	return err == nil || errors.Is(err, syscall.EPERM)
}
