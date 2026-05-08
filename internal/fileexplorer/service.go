package fileexplorer

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"kiromanager/internal/shared/utils"
)

// FileExplorerService provides file system operations including browsing,
// reading, creating, copying, moving, renaming, and deleting files and folders.
type FileExplorerService struct {
	logger *utils.Logger
}

// NewFileExplorerService creates a new FileExplorerService.
func NewFileExplorerService(logger *utils.Logger) *FileExplorerService {
	return &FileExplorerService{
		logger: logger,
	}
}

// Browse lists the folders and files at the given path. Hidden entries (prefixed
// with ".") are excluded. Files are filtered by the provided extensions; an empty
// filter or ["*"] shows all files.
func (s *FileExplorerService) Browse(path string, filter []string) (*BrowseResponse, error) {
	// Expand home directory
	path = utils.ExpandHomePath(path)

	// Read directory — return empty result if path doesn't exist
	entries, err := os.ReadDir(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &BrowseResponse{Path: path, Folders: []FolderInfo{}, Files: []FileInfo{}}, nil
		}
		return nil, fmt.Errorf("failed to read directory: %v", err)
	}

	folders := []FolderInfo{}
	files := []FileInfo{}

	for _, entry := range entries {
		// Skip hidden files/folders
		if strings.HasPrefix(entry.Name(), ".") {
			continue
		}

		if entry.IsDir() {
			// Always show folders
			folders = append(folders, FolderInfo{
				Name: entry.Name(),
				Path: filepath.Join(path, entry.Name()),
			})
		} else {
			// Filter files by extension
			if s.matchesFilter(entry.Name(), filter) {
				info, _ := entry.Info()
				files = append(files, FileInfo{
					Name:     entry.Name(),
					Path:     filepath.Join(path, entry.Name()),
					Size:     info.Size(),
					Modified: info.ModTime().Format(time.RFC3339),
				})
			}
		}
	}

	return &BrowseResponse{
		Path:    path,
		Folders: folders,
		Files:   files,
	}, nil
}

// matchesFilter reports whether filename matches any of the given extension filters.
func (s *FileExplorerService) matchesFilter(filename string, filter []string) bool {
	// If filter is empty or contains "*", show all files
	if len(filter) == 0 || (len(filter) == 1 && filter[0] == "*") {
		return true
	}

	// Check if file extension matches any filter
	for _, ext := range filter {
		if strings.HasSuffix(filename, ext) {
			return true
		}
	}

	return false
}

// ReadFile returns the contents of the file at the given path.
func (s *FileExplorerService) ReadFile(path string) (string, error) {
	path = utils.ExpandHomePath(path)

	content, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("failed to read file: %v", err)
	}

	return string(content), nil
}

// CreateFolder creates a new directory at the given path, including any
// necessary parent directories. Returns an error if the folder already exists.
func (s *FileExplorerService) CreateFolder(path string) error {
	path = utils.ExpandHomePath(path)

	// Check if folder already exists
	if _, err := os.Stat(path); err == nil {
		return utils.NewAppError("Folder already exists", 409, "CONFLICT")
	}

	if err := os.MkdirAll(path, 0755); err != nil {
		return fmt.Errorf("failed to create folder: %v", err)
	}

	s.logger.Info("Created folder: %s", path)
	return nil
}

// CreateFile writes content to the file at the given path, creating parent
// directories as needed. Existing files are overwritten.
func (s *FileExplorerService) CreateFile(path, content string) error {
	path = utils.ExpandHomePath(path)

	// Create parent directories if needed
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return fmt.Errorf("failed to create parent directory: %v", err)
	}

	// Write file (creates or overwrites)
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return fmt.Errorf("failed to write file: %v", err)
	}

	s.logger.Info("Saved file: %s", path)
	return nil
}

// Cut moves a file or directory from source to dest.
func (s *FileExplorerService) Cut(source, dest string) error {
	source = utils.ExpandHomePath(source)
	dest = utils.ExpandHomePath(dest)

	if err := os.Rename(source, dest); err != nil {
		return fmt.Errorf("failed to cut: %v", err)
	}

	s.logger.Info("Cut %s to %s", source, dest)
	return nil
}

// Copy duplicates a file or directory from source to dest.
// Returns an error if the destination already exists.
func (s *FileExplorerService) Copy(source, dest string) error {
	source = utils.ExpandHomePath(source)
	dest = utils.ExpandHomePath(dest)

	// Check if destination exists
	if _, err := os.Stat(dest); err == nil {
		return utils.NewAppError("Destination already exists", 409, "CONFLICT")
	}

	sourceInfo, err := os.Stat(source)
	if err != nil {
		return fmt.Errorf("source not found: %v", err)
	}

	if sourceInfo.IsDir() {
		return s.copyDir(source, dest)
	}
	return s.copyFile(source, dest)
}

// copyFile copies a single file from source to dest.
func (s *FileExplorerService) copyFile(source, dest string) error {
	if err := utils.CopyFile(source, dest); err != nil {
		return err
	}
	s.logger.Info("Copied file %s to %s", source, dest)
	return nil
}

// copyDir recursively copies a directory from source to dest.
func (s *FileExplorerService) copyDir(source, dest string) error {
	if err := utils.CopyDir(source, dest); err != nil {
		return err
	}
	s.logger.Info("Copied directory %s to %s", source, dest)
	return nil
}

// Rename renames a file or directory at path to newName within the same parent directory.
func (s *FileExplorerService) Rename(path, newName string) error {
	path = utils.ExpandHomePath(path)

	dir := filepath.Dir(path)
	newPath := filepath.Join(dir, newName)

	if err := os.Rename(path, newPath); err != nil {
		return fmt.Errorf("failed to rename: %v", err)
	}

	s.logger.Info("Renamed %s to %s", path, newPath)
	return nil
}

// Delete removes the file or directory at the given path.
func (s *FileExplorerService) Delete(path string) error {
	path = utils.ExpandHomePath(path)

	if err := os.RemoveAll(path); err != nil {
		return fmt.Errorf("failed to delete: %v", err)
	}

	s.logger.Info("Deleted: %s", path)
	return nil
}

// BulkCopy copies multiple source paths into dest. The resolution parameter
// controls conflict handling: "skip", "rename", or "overwrite".
func (s *FileExplorerService) BulkCopy(sources []string, dest string, resolution string) *BulkOperationResponse {
	dest = utils.ExpandHomePath(dest)
	response := &BulkOperationResponse{
		Success: []string{},
		Failed:  []FailedOperation{},
	}

	for _, source := range sources {
		source = utils.ExpandHomePath(source)
		sourceName := filepath.Base(source)
		destPath := filepath.Join(dest, sourceName)

		// Check for conflicts and handle based on resolution
		if _, err := os.Stat(destPath); err == nil {
			switch resolution {
			case "skip":
				continue
			case "rename":
				destPath = filepath.Join(dest, s.GenerateUniqueName(dest, sourceName))
			case "overwrite":
				// Remove existing file/folder before copying
				os.RemoveAll(destPath)
			}
		}

		// Perform copy
		sourceInfo, err := os.Stat(source)
		if err != nil {
			response.Failed = append(response.Failed, FailedOperation{
				Path:  source,
				Error: err.Error(),
			})
			continue
		}

		if sourceInfo.IsDir() {
			err = s.copyDir(source, destPath)
		} else {
			err = s.copyFile(source, destPath)
		}

		if err != nil {
			response.Failed = append(response.Failed, FailedOperation{
				Path:  source,
				Error: err.Error(),
			})
		} else {
			response.Success = append(response.Success, source)
		}
	}

	return response
}

// BulkCut moves multiple source paths into dest. The resolution parameter
// controls conflict handling: "skip", "rename", or "overwrite".
func (s *FileExplorerService) BulkCut(sources []string, dest string, resolution string) *BulkOperationResponse {
	dest = utils.ExpandHomePath(dest)
	response := &BulkOperationResponse{
		Success: []string{},
		Failed:  []FailedOperation{},
	}

	for _, source := range sources {
		source = utils.ExpandHomePath(source)
		sourceName := filepath.Base(source)
		destPath := filepath.Join(dest, sourceName)

		// Check for conflicts and handle based on resolution
		if _, err := os.Stat(destPath); err == nil {
			switch resolution {
			case "skip":
				continue
			case "rename":
				destPath = filepath.Join(dest, s.GenerateUniqueName(dest, sourceName))
			case "overwrite":
				// Remove existing file/folder before moving
				os.RemoveAll(destPath)
			}
		}

		// Perform move
		if err := os.Rename(source, destPath); err != nil {
			response.Failed = append(response.Failed, FailedOperation{
				Path:  source,
				Error: err.Error(),
			})
		} else {
			response.Success = append(response.Success, source)
		}
	}

	return response
}

// BulkDelete removes all files and directories at the given paths.
func (s *FileExplorerService) BulkDelete(paths []string) *BulkOperationResponse {
	response := &BulkOperationResponse{
		Success: []string{},
		Failed:  []FailedOperation{},
	}

	for _, path := range paths {
		path = utils.ExpandHomePath(path)

		if err := os.RemoveAll(path); err != nil {
			response.Failed = append(response.Failed, FailedOperation{
				Path:  path,
				Error: err.Error(),
			})
		} else {
			response.Success = append(response.Success, path)
			s.logger.Info("Deleted: %s", path)
		}
	}

	return response
}

// CheckConflicts returns information about which source paths would conflict
// with existing entries in the destination directory.
func (s *FileExplorerService) CheckConflicts(sources []string, dest string) []ConflictInfo {
	dest = utils.ExpandHomePath(dest)
	conflicts := []ConflictInfo{}

	for _, source := range sources {
		source = utils.ExpandHomePath(source)
		sourceName := filepath.Base(source)
		destPath := filepath.Join(dest, sourceName)

		if _, err := os.Stat(destPath); err == nil {
			conflicts = append(conflicts, ConflictInfo{
				Path:     source,
				DestPath: destPath,
				Exists:   true,
			})
		}
	}

	return conflicts
}

// GenerateUniqueName returns a filename that does not conflict with existing
// entries in basePath by appending a numeric suffix (e.g. "file (1).txt").
func (s *FileExplorerService) GenerateUniqueName(basePath, name string) string {
	basePath = utils.ExpandHomePath(basePath)
	ext := filepath.Ext(name)
	nameWithoutExt := strings.TrimSuffix(name, ext)
	
	counter := 1
	newName := name
	newPath := filepath.Join(basePath, newName)

	for {
		if _, err := os.Stat(newPath); os.IsNotExist(err) {
			return newName
		}
		newName = fmt.Sprintf("%s (%d)%s", nameWithoutExt, counter, ext)
		newPath = filepath.Join(basePath, newName)
		counter++
	}
}
