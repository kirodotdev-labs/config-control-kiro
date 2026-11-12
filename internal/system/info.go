package system

import (
	"kiromanager/internal/kirocli"
	"runtime"
	"time"
)

// SystemInfo contains host environment details returned by the system info endpoint.
type SystemInfo struct {
	Platform   string    `json:"platform"`
	Arch       string    `json:"arch"`
	IsWSL      bool      `json:"isWSL"`
	HomeDir    string    `json:"homeDir"`
	KiroPath   string    `json:"kiroPath"`
	ConfigPath string    `json:"configPath"`
	GlobalPath string    `json:"globalPath"` // the global Kiro home (~/.kiro or KIRO_HOME)
	GoVersion  string    `json:"goVersion"`
	AppVersion string    `json:"appVersion"`
	Timestamp  time.Time `json:"timestamp"`
}

// GetSystemInfo returns platform, architecture, and Kiro path details.
func (s *KiroService) GetSystemInfo() (*SystemInfo, error) {
	return &SystemInfo{
		Platform:   runtime.GOOS,
		Arch:       runtime.GOARCH,
		IsWSL:      s.isWSL,
		HomeDir:    s.homeDir,
		KiroPath:   kirocli.Locate(),
		ConfigPath: s.GetConfigPath(),
		GlobalPath: s.globalConfigPath,
		GoVersion:  runtime.Version(),
		AppVersion: s.appVersion,
		Timestamp:  time.Now(),
	}, nil
}
