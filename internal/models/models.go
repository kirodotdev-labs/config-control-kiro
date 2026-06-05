// Package models defines the shared data types used across the kiromanager application.
package models

import "time"

// Agent represents a configured AI agent with its model, prompt, and tool settings.
type Agent struct {
	Name             string      `json:"name"`
	Model            string      `json:"model,omitempty"`
	Description      string      `json:"description,omitempty"`
	Prompt           string      `json:"prompt,omitempty"`
	Tools            []interface{} `json:"tools,omitempty"`
	AllowedTools     []interface{} `json:"allowedTools,omitempty"`
	Resources        []interface{} `json:"resources,omitempty"`
	MCPServers       interface{} `json:"mcpServers,omitempty"`
	Hooks            interface{} `json:"hooks,omitempty"`
	ToolAliases      interface{} `json:"toolAliases,omitempty"`
	ToolsSettings    interface{} `json:"toolsSettings,omitempty"`
	UseLegacyMcpJson bool        `json:"useLegacyMcpJson,omitempty"`
	IncludeMcpJson   *bool       `json:"includeMcpJson,omitempty"`
	KeyboardShortcut string      `json:"keyboardShortcut,omitempty"`
	WelcomeMessage   string      `json:"welcomeMessage,omitempty"`
}

// AgentConfig holds the runtime configuration for an agent's model parameters.
type AgentConfig struct {
	Model       string  `json:"model"`
	Temperature float64 `json:"temperature"`
	MaxTokens   int     `json:"maxTokens"`
}

// MCPServer represents a Model Context Protocol server configuration.
type MCPServer struct {
	ID            string            `json:"id"`
	Name          string            `json:"name"`
	Type          string            `json:"type"`
	Command       string            `json:"command,omitempty"`
	Args          []string          `json:"args,omitempty"`
	URL           string            `json:"url,omitempty"`
	Env           map[string]string `json:"env,omitempty"`
	Headers       map[string]string `json:"headers,omitempty"`
	Enabled       bool              `json:"enabled"`
	AutoApprove   []string          `json:"autoApprove,omitempty"`
	DisabledTools []string          `json:"disabledTools,omitempty"`
}

// SystemInfo contains host environment details returned by the system info endpoint.
type SystemInfo struct {
	Platform   string    `json:"platform"`
	Arch       string    `json:"arch"`
	IsWSL      bool      `json:"isWSL"`
	HomeDir    string    `json:"homeDir"`
	KiroPath   string    `json:"kiroPath"`
	ConfigPath string    `json:"configPath"`
	GoVersion  string    `json:"goVersion"`
	AppVersion string    `json:"appVersion"`
	Timestamp  time.Time `json:"timestamp"`
}

// VersionCheck contains the current and latest app version for update detection.
type VersionCheck struct {
	Current     string `json:"current"`
	Latest      string `json:"latest"`
	UpdateAvail bool   `json:"updateAvailable"`
	ReleaseURL  string `json:"releaseURL"`
}

// SuccessResponse is a generic JSON response indicating success or failure with a message.
type SuccessResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// DataResponse wraps arbitrary data in a JSON envelope.
type DataResponse struct {
	Data interface{} `json:"data"`
}

// WSMessage represents a typed WebSocket message with a payload.
type WSMessage struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

// FileInfo describes a file or directory with its metadata.
type FileInfo struct {
	Name    string    `json:"name"`
	Path    string    `json:"path"`
	Size    int64     `json:"size"`
	IsDir   bool      `json:"isDir"`
	ModTime time.Time `json:"modTime"`
}

// FileItem represents a single entry in a directory listing.
type FileItem struct {
	Name    string    `json:"name"`
	Path    string    `json:"path"`
	Type    string    `json:"type"` // "file" or "directory"
	Size    int64     `json:"size,omitempty"`
	ModTime time.Time `json:"modTime"`
}

// DirectoryContents holds the items and path for a directory listing response.
type DirectoryContents struct {
	Items       []FileItem `json:"items"`
	CurrentPath string     `json:"currentPath"`
}
