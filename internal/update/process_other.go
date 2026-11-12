//go:build !windows

package update

import "os/exec"

// detach leaves the new version in this terminal (if any): it keeps running
// after this process exits.
func detach(cmd *exec.Cmd) {}
