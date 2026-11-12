// Package launcher opens a native OS terminal running a kiro-cli command.
package launcher

import (
	"os/exec"
	"runtime"

	"kiromanager/internal/shared/utils"
)

// Service launches native terminal windows. It supports Windows, macOS,
// Linux and WSL.
type Service struct {
	logger       *utils.Logger
	platform     Platform
	start        func(*exec.Cmd) error
	findTerminal func() string
}

// NewService creates a launcher Service for the current OS. Set isWSL when
// running inside Windows Subsystem for Linux.
func NewService(logger *utils.Logger, isWSL bool) *Service {
	return &Service{
		logger:       logger,
		platform:     detectPlatform(runtime.GOOS, isWSL),
		start:        startDetached,
		findTerminal: findLinuxTerminal,
	}
}

// Launch validates command, resolves directory, and opens a terminal there.
func (s *Service) Launch(directory, command string) error {
	if err := ValidateCommand(command); err != nil {
		return err
	}
	dir, err := ResolveDirectory(directory)
	if err != nil {
		return err
	}
	cmd, err := buildCommand(s.platform, dir, command, s.findTerminal)
	if err != nil {
		return err
	}
	s.logger.Info("Launching terminal: dir=%s cmd=%s platform=%s", dir, command, s.platform)
	if err := s.start(cmd); err != nil {
		s.logger.Error("Failed to launch terminal: %v", err)
		return err
	}
	return nil
}

// detectPlatform maps the OS and WSL flag to a Platform.
func detectPlatform(goos string, isWSL bool) Platform {
	switch {
	case goos == "windows":
		return PlatformWindows
	case isWSL:
		return PlatformWSL
	case goos == "darwin":
		return PlatformMac
	default:
		return PlatformLinux
	}
}

// startDetached starts cmd and reaps it in the background.
func startDetached(cmd *exec.Cmd) error {
	if err := cmd.Start(); err != nil {
		return err
	}
	go func() { _ = cmd.Wait() }()
	return nil
}
