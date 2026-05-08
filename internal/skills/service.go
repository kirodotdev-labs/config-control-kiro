package skills

import (
	"os"
	"path/filepath"

	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

// Service manages Kiro skills stored in the .kiro/skills directory.
type Service struct {
	logger      *utils.Logger
	kiroService *system.KiroService
}

// NewService creates a new skills Service.
func NewService(kiroService *system.KiroService, logger *utils.Logger) *Service {
	return &Service{
		logger:      logger,
		kiroService: kiroService,
	}
}

// getKiroPath returns the path to the skills directory.
func (s *Service) getKiroPath() string {
	return filepath.Join(s.kiroService.GetConfigPath(), "skills")
}

// Deactivate removes all skills from the skills directory.
func (s *Service) Deactivate() error {
	os.MkdirAll(s.getKiroPath(), 0755)

	entries, err := os.ReadDir(s.getKiroPath())
	if err == nil {
		for _, entry := range entries {
			os.RemoveAll(filepath.Join(s.getKiroPath(), entry.Name()))
		}
	}

	s.logger.Info("Deactivated all skills")
	return nil
}
