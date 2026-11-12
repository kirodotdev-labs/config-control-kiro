package mcp

import (
	"errors"
	"io/fs"
	"net/http"
	"os"

	"kiromanager/internal/shared/ordered"
	"kiromanager/internal/shared/utils"
)

// ConfigDocument is mcp.json for the active scope. Config keeps the file's key
// order so hand-edited files round-trip without reshuffling.
type ConfigDocument struct {
	Config *ordered.Object `json:"config"`
	Path   string          `json:"path"`
	Exists bool            `json:"exists"`
}

// GetMCPConfig reads mcp.json for the active scope. A missing file yields an
// empty config; an unparseable one is an error, so the app never offers to
// save over (and lose) a file it could not read.
func (s *MCPService) GetMCPConfig() (*ConfigDocument, error) {
	path := s.kiroService.MCPConfigPath()
	doc := &ConfigDocument{Config: ordered.New(), Path: path}
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		_ = doc.Config.Set("mcpServers", map[string]any{})
		return doc, nil
	}
	if err != nil {
		return nil, utils.NewAppError("Failed to read mcp.json", http.StatusInternalServerError, "MCP_READ_ERROR")
	}
	doc.Exists = true
	if err := doc.Config.UnmarshalJSON(data); err != nil {
		return nil, utils.NewAppError("mcp.json is not valid JSON: "+err.Error(), http.StatusUnprocessableEntity, "MCP_CONFIG_INVALID")
	}
	return doc, nil
}

// SaveMCPConfig writes config as mcp.json for the active scope and returns the path.
func (s *MCPService) SaveMCPConfig(config *ordered.Object) (string, error) {
	if config == nil {
		return "", utils.BadRequest("config is required", "INVALID_REQUEST")
	}
	path := s.kiroService.MCPConfigPath()
	data, err := config.Pretty()
	if err != nil {
		return "", utils.NewAppError("Failed to encode config", http.StatusInternalServerError, "MCP_SAVE_ERROR")
	}
	if err := utils.WriteFileAtomic(path, data); err != nil {
		return "", utils.NewAppError("Failed to write config", http.StatusInternalServerError, "MCP_SAVE_ERROR")
	}
	s.logger.Info("MCP configuration saved to %s", path)
	return path, nil
}
