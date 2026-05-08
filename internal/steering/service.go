package steering

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

// Service manages steering markdown files stored in the .kiro/steering directory.
// Steering files provide contextual instructions that guide agent behavior.
type Service struct {
	logger      *utils.Logger
	kiroService *system.KiroService
}

// NewService creates a new steering Service.
func NewService(kiroService *system.KiroService, logger *utils.Logger) *Service {
	return &Service{
		logger:      logger,
		kiroService: kiroService,
	}
}

// getSteeringPath returns the current .kiro/steering path.
func (s *Service) getSteeringPath() string {
	return filepath.Join(s.kiroService.GetConfigPath(), "steering")
}

// GetFiles returns the list of .md filenames in the steering directory.
func (s *Service) GetFiles() ([]string, error) {
	steeringPath := s.getSteeringPath()
	os.MkdirAll(steeringPath, 0755)

	var files []string
	err := filepath.WalkDir(steeringPath, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if !d.IsDir() && strings.HasSuffix(d.Name(), ".md") {
			rel, _ := filepath.Rel(steeringPath, path)
			files = append(files, rel)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	return files, nil
}

// GetFileContent reads and returns the content of a steering file.
func (s *Service) GetFileContent(filename string) (string, error) {
	filePath := filepath.Join(s.getSteeringPath(), filename)
	content, err := os.ReadFile(filePath)
	if err != nil {
		return "", err
	}
	return string(content), nil
}

// SaveFile creates or updates a steering file. The filename must end with ".md".
func (s *Service) SaveFile(filename, content string) error {
	if !strings.HasSuffix(filename, ".md") {
		return fmt.Errorf("filename must end with .md")
	}
	os.MkdirAll(s.getSteeringPath(), 0755)
	return os.WriteFile(filepath.Join(s.getSteeringPath(), filename), []byte(content), 0644)
}

// DeleteFile removes a steering file by name.
func (s *Service) DeleteFile(filename string) error {
	return os.Remove(filepath.Join(s.getSteeringPath(), filename))
}
