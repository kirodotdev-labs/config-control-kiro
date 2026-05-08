// Package file provides filesystem browsing, file URI generation,
// and file upload capabilities.
package file

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"kiromanager/internal/models"
	"kiromanager/internal/shared/utils"
)

// FileService provides operations for browsing directories,
// generating file URIs, and uploading files.
type FileService struct {
	logger *utils.Logger
}

// NewFileService creates a FileService with the given logger.
func NewFileService(logger *utils.Logger) *FileService {
	return &FileService{logger: logger}
}

// BrowseFiles lists the contents of the directory at path, expanding
// tilde and resolving relative paths to absolute ones.
func (fs *FileService) BrowseFiles(path string) (*models.DirectoryContents, error) {
	// Expand ~ to home directory
	if path == "~" || strings.HasPrefix(path, "~/") {
		homeDir, _ := os.UserHomeDir()
		if path == "~" {
			path = homeDir
		} else {
			path = filepath.Join(homeDir, path[2:])
		}
	}

	cleanPath := filepath.Clean(path)
	if cleanPath == "" || cleanPath == "." {
		homeDir, _ := os.UserHomeDir()
		cleanPath = homeDir
	}

	// Convert to absolute path if relative
	if !filepath.IsAbs(cleanPath) {
		absPath, err := filepath.Abs(cleanPath)
		if err != nil {
			return nil, fmt.Errorf("failed to resolve absolute path: %w", err)
		}
		cleanPath = absPath
	}

	entries, err := os.ReadDir(cleanPath)
	if err != nil {
		return nil, err
	}

	var items []models.FileItem

	for _, entry := range entries {
		fullPath := filepath.Join(cleanPath, entry.Name())
		info, err := entry.Info()
		if err != nil {
			continue
		}

		item := models.FileItem{
			Name:    entry.Name(),
			Path:    fullPath,
			ModTime: info.ModTime(),
		}

		if entry.IsDir() {
			item.Type = "directory"
		} else {
			item.Type = "file"
			item.Size = info.Size()
		}

		items = append(items, item)
	}

	return &models.DirectoryContents{
		Items:       items,
		CurrentPath: cleanPath,
	}, nil
}

// GenerateFileURI returns a file:// URI for the given path.
func (fs *FileService) GenerateFileURI(path string) string {
	cleanPath := filepath.Clean(path)
	return fmt.Sprintf("file://%s", cleanPath)
}

// UploadFile writes the contents of srcReader to destPath, creating
// parent directories as needed.
func (fs *FileService) UploadFile(srcReader io.Reader, destPath string) error {
	if err := os.MkdirAll(filepath.Dir(destPath), 0700); err != nil {
		return err
	}

	destFile, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer destFile.Close()

	_, err = io.Copy(destFile, srcReader)
	return err
}
