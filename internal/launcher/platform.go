package launcher

import (
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"os/exec"
	"strings"
	"unicode/utf16"
)

// Platform identifies which terminal strategy to use.
type Platform string

// Supported platforms.
const (
	PlatformWindows Platform = "windows"
	PlatformWSL     Platform = "wsl"
	PlatformMac     Platform = "darwin"
	PlatformLinux   Platform = "linux"
)

// buildCommand returns the OS command that opens a terminal in dir and runs
// command. command must already have passed ValidateCommand.
func buildCommand(p Platform, dir, command string, findTerminal func() string) (*exec.Cmd, error) {
	echo := fmt.Sprintf("echo '$ %s'", command)
	switch p {
	case PlatformWindows:
		ps := fmt.Sprintf("Set-Location '%s'; Write-Host '$ %s'; %s", psEscape(dir), command, command)
		return exec.Command("cmd.exe", "/c", "start", "powershell.exe", "-NoExit", "-EncodedCommand", encodePowerShell(ps)), nil
	case PlatformWSL:
		bash := fmt.Sprintf("source ~/.bashrc 2>/dev/null; source ~/.profile 2>/dev/null; cd '%s'; %s; %s; exec bash", shellEscape(dir), echo, command)
		ps := fmt.Sprintf("wsl.exe bash -ic \"%s\"", bash)
		start := fmt.Sprintf("Start-Process powershell.exe -ArgumentList '-NoExit','-EncodedCommand','%s'", encodePowerShell(ps))
		return exec.Command("powershell.exe", "-Command", start), nil
	case PlatformMac:
		sh := fmt.Sprintf("source ~/.zshrc 2>/dev/null; source ~/.bash_profile 2>/dev/null; cd '%s' && %s && %s", shellEscape(dir), echo, command)
		script := fmt.Sprintf("tell application \"Terminal\"\n\tactivate\n\tdo script \"%s\"\nend tell", strings.ReplaceAll(sh, `"`, `\"`))
		return exec.Command("osascript", "-e", script), nil
	default:
		term := findTerminal()
		if term == "" {
			return nil, fmt.Errorf("no terminal emulator found; install xterm or gnome-terminal")
		}
		bash := fmt.Sprintf("source ~/.bashrc 2>/dev/null; source ~/.profile 2>/dev/null; cd '%s' && %s && %s; exec bash", shellEscape(dir), echo, command)
		return exec.Command(term, "-e", "bash", "-c", bash), nil
	}
}

// shellEscape escapes single quotes for use inside a single-quoted POSIX shell string.
func shellEscape(s string) string {
	return strings.ReplaceAll(s, "'", `'\''`)
}

// psEscape escapes single quotes for use inside a single-quoted PowerShell string.
func psEscape(s string) string {
	return strings.ReplaceAll(s, "'", "''")
}

// encodePowerShell encodes cmd as base64 UTF-16LE for PowerShell -EncodedCommand.
func encodePowerShell(cmd string) string {
	units := utf16.Encode([]rune(cmd))
	buf := make([]byte, len(units)*2)
	for i, u := range units {
		binary.LittleEndian.PutUint16(buf[i*2:], u)
	}
	return base64.StdEncoding.EncodeToString(buf)
}

// findLinuxTerminal returns the first available terminal emulator, or "".
func findLinuxTerminal() string {
	for _, t := range []string{"x-terminal-emulator", "gnome-terminal", "konsole", "xfce4-terminal", "xterm"} {
		if path, err := exec.LookPath(t); err == nil {
			return path
		}
	}
	return ""
}
