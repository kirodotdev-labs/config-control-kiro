package launcher

import (
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"kiromanager/internal/shared/utils"
)

// Service launches native OS terminal windows with a specified command.
// It supports Windows, macOS, Linux, and WSL environments.
type Service struct {
	logger *utils.Logger
	isWSL  bool
}

// NewService creates a new launcher Service. Set isWSL to true when running
// inside Windows Subsystem for Linux.
func NewService(logger *utils.Logger, isWSL bool) *Service {
	return &Service{logger: logger, isWSL: isWSL}
}

// Launch opens the native OS terminal at the given directory and runs the command.
// It detects the current platform and selects the appropriate terminal emulator.
func (s *Service) Launch(directory, command string) error {
	// Resolve ~ to home
	if directory == "" || directory == "~" {
		directory, _ = os.UserHomeDir()
	} else if strings.HasPrefix(directory, "~/") {
		home, _ := os.UserHomeDir()
		directory = filepath.Join(home, directory[2:])
	}

	// Validate directory exists
	if stat, err := os.Stat(directory); err != nil || !stat.IsDir() {
		directory, _ = os.UserHomeDir()
	}

	s.logger.Info("Launching terminal: dir=%s cmd=%s os=%s wsl=%v", directory, command, runtime.GOOS, s.isWSL)

	var cmd *exec.Cmd

	switch {
	case runtime.GOOS == "windows":
		// Native Windows: use cmd /c start to force a new visible window
		psCmd := fmt.Sprintf("Set-Location '%s'; Write-Host '$ %s'; %s", directory, command, command)
		encoded := encodePowerShell(psCmd)
		cmd = exec.Command("cmd.exe", "/c", "start", "powershell.exe", "-NoExit", "-EncodedCommand", encoded)

	case s.isWSL:
		// WSL: open PowerShell window that runs wsl bash with EncodedCommand
		bashCmd := fmt.Sprintf("source ~/.bashrc 2>/dev/null; source ~/.profile 2>/dev/null; cd '%s'; echo '$ %s'; %s; exec bash", shellEscape(directory), command, command)
		psCmd := fmt.Sprintf("wsl.exe bash -ic \"%s\"", bashCmd)
		encoded := encodePowerShell(psCmd)
		cmd = exec.Command("powershell.exe", "-Command",
			fmt.Sprintf("Start-Process powershell.exe -ArgumentList '-NoExit','-EncodedCommand','%s'", encoded))

	case runtime.GOOS == "darwin":
		// macOS: open Terminal.app via AppleScript
		shellCmd := fmt.Sprintf("source ~/.zshrc 2>/dev/null; source ~/.bash_profile 2>/dev/null; cd '%s' && echo '$ %s' && %s", shellEscape(directory), command, command)
		script := fmt.Sprintf(`tell application "Terminal"
	activate
	do script "%s"
end tell`, shellCmd)
		cmd = exec.Command("osascript", "-e", script)

	default:
		// Native Linux with GUI terminal
		shell := findLinuxTerminal()
		if shell == "" {
			return fmt.Errorf("no terminal emulator found, install xterm or gnome-terminal")
		}
		bashCmd := fmt.Sprintf("source ~/.bashrc 2>/dev/null; source ~/.profile 2>/dev/null; cd '%s' && echo '$ %s' && %s; exec bash", shellEscape(directory), command, command)
		cmd = exec.Command(shell, "-e", "bash", "-c", bashCmd)
	}

	if err := cmd.Start(); err != nil {
		s.logger.Error("Failed to launch terminal: %v", err)
		return fmt.Errorf("failed to launch terminal: %w", err)
	}

	// Detach — fire and forget
	go cmd.Wait()
	return nil
}

// shellEscape escapes single quotes in a string for safe use inside single-quoted shell arguments.
func shellEscape(s string) string {
	return strings.ReplaceAll(s, "'", "'\\''")
}

// encodePowerShell encodes a command string to base64 UTF-16LE for PowerShell -EncodedCommand.
func encodePowerShell(cmd string) string {
	// PowerShell requires UTF-16LE encoding
	utf16 := make([]byte, len(cmd)*2)
	for i, r := range cmd {
		binary.LittleEndian.PutUint16(utf16[i*2:], uint16(r))
	}
	return base64.StdEncoding.EncodeToString(utf16)
}

// findLinuxTerminal searches for an available terminal emulator on Linux.
func findLinuxTerminal() string {
	terminals := []string{"x-terminal-emulator", "gnome-terminal", "konsole", "xfce4-terminal", "xterm"}
	for _, t := range terminals {
		if path, err := exec.LookPath(t); err == nil {
			return path
		}
	}
	return ""
}
