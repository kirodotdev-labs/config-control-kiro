// Package mcp manages MCP server configuration (settings/mcp.json) and
// discovers the tools each MCP server exposes.
package mcp

import (
	"sync"

	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

// MCPService reads and writes mcp.json and queries servers for their tools.
type MCPService struct {
	kiroService *system.KiroService
	logger      *utils.Logger
	mu          sync.Mutex
	running     map[string]*measurement // tools listings in progress, by server and launch
}

// NewMCPService creates an MCPService.
func NewMCPService(kiroService *system.KiroService, logger *utils.Logger) *MCPService {
	return &MCPService{kiroService: kiroService, logger: logger, running: map[string]*measurement{}}
}
