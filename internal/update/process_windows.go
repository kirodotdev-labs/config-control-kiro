package update

import (
	"os/exec"
	"syscall"
)

// detach starts the new version in its own console window, so it keeps
// running after this process exits and can be closed like before.
func detach(cmd *exec.Cmd) {
	const createNewConsole = 0x00000010
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: createNewConsole}
}
