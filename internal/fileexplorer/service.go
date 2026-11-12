package fileexplorer

import (
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

// FileExplorerService provides file system operations including browsing,
// reading, creating, copying, moving, renaming, and deleting files and folders.
type FileExplorerService struct {
	logger    *utils.Logger
	isWSL     bool
	deletable func() system.DeletableRoots
}

// NewFileExplorerService creates a new FileExplorerService. Set isWSL to true
// when running inside Windows Subsystem for Linux so pasted Windows-style
// paths can be translated to /mnt/<drive>/... mount points. deletable names
// the folders Delete may work in; nil allows no deletion.
func NewFileExplorerService(logger *utils.Logger, isWSL bool, deletable func() system.DeletableRoots) *FileExplorerService {
	if deletable == nil {
		deletable = func() system.DeletableRoots { return system.DeletableRoots{} }
	}
	return &FileExplorerService{
		logger:    logger,
		isWSL:     isWSL,
		deletable: deletable,
	}
}

// Delete removes a file below one of the deletable folders, or a skill or
// spec folder (a direct child of the skills or specs folder) with everything
// in it. Anything else is refused, so Kiro's stores and settings files can't
// be deleted through the app.
func (s *FileExplorerService) Delete(path string) error {
	abs, err := filepath.Abs(utils.ExpandHomePath(path))
	if err != nil {
		return utils.BadRequest("Not a usable path", "INVALID_PATH")
	}
	info, err := os.Stat(abs)
	if errors.Is(err, fs.ErrNotExist) {
		return utils.NewAppError("This file doesn't exist.", http.StatusNotFound, "FILE_NOT_FOUND")
	}
	if err != nil {
		return fmt.Errorf("failed to read %s: %v", abs, err)
	}
	roots := s.deletable()
	if info.IsDir() {
		if !isDirectChild(abs, roots.Folders) {
			return utils.NewAppError("Only a skill, a spec or one of your own powers can be deleted here.", http.StatusForbidden, "NOT_DELETABLE")
		}
		if err := os.RemoveAll(abs); err != nil {
			return fmt.Errorf("failed to delete folder: %v", err)
		}
		s.logger.Info("Deleted folder: %s", abs)
		return nil
	}
	if !isBelow(abs, roots.Files) && !isOneOf(abs, roots.Exact) {
		return utils.NewAppError("Only hooks, steering, skills, prompts, workflows, specs, files inside powers and lsp.json can be deleted here.", http.StatusForbidden, "NOT_DELETABLE")
	}
	if err := os.Remove(abs); err != nil {
		return fmt.Errorf("failed to delete file: %v", err)
	}
	s.logger.Info("Deleted file: %s", abs)
	return nil
}

// isOneOf reports whether abs is exactly one of paths.
func isOneOf(abs string, paths []string) bool {
	for _, p := range paths {
		if p != "" && filepath.Clean(p) == abs {
			return true
		}
	}
	return false
}

// isBelow reports whether abs is strictly inside one of roots.
func isBelow(abs string, roots []string) bool {
	for _, root := range roots {
		rel, err := filepath.Rel(root, abs)
		if err == nil && rel != "." && !strings.HasPrefix(rel, "..") {
			return true
		}
	}
	return false
}

// isDirectChild reports whether abs is an immediate child of one of roots.
func isDirectChild(abs string, roots []string) bool {
	for _, root := range roots {
		if filepath.Dir(abs) == filepath.Clean(root) {
			return true
		}
	}
	return false
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
	if errors.Is(err, fs.ErrNotExist) {
		return "", utils.NewAppError("This file doesn't exist yet.", http.StatusNotFound, "FILE_NOT_FOUND")
	}
	if err != nil {
		return "", fmt.Errorf("failed to read file: %v", err)
	}

	return string(content), nil
}

// CreateFile writes content to the file at the given path, creating parent
// directories as needed. Existing files are overwritten.
func (s *FileExplorerService) CreateFile(path, content string, createOnly bool) error {
	path = utils.ExpandHomePath(path)
	if createOnly {
		if _, err := os.Stat(path); err == nil {
			return utils.NewAppError("A file with that name already exists", http.StatusConflict, "FILE_EXISTS")
		}
	}
	// WriteFileAtomic creates parent directories and never leaves a torn file.
	if err := utils.WriteFileAtomic(path, []byte(content)); err != nil {
		return fmt.Errorf("failed to write file: %v", err)
	}

	s.logger.Info("Saved file: %s", path)
	return nil
}

// maxCopy caps a copied file: skill scripts, references and assets are small.
const maxCopy = 20 << 20

// CopyFile copies the regular file at source to dest, byte for byte, so
// scripts and binary assets survive. dest must be inside a folder the UI
// manages (the same roots files can be deleted from: skills, powers and so
// on); an existing dest is replaced only with overwrite.
func (s *FileExplorerService) CopyFile(source, dest string, overwrite bool) error {
	src, err := filepath.Abs(utils.ExpandHomePath(source))
	if err != nil {
		return utils.BadRequest("Not a usable path", "INVALID_PATH")
	}
	dst, err := filepath.Abs(utils.ExpandHomePath(dest))
	if err != nil {
		return utils.BadRequest("Not a usable path", "INVALID_PATH")
	}
	if !isBelow(dst, s.deletable().Files) {
		return utils.NewAppError("Files can only be copied into a skill or power folder here.", http.StatusForbidden, "NOT_WRITABLE")
	}
	info, err := os.Stat(src)
	if errors.Is(err, fs.ErrNotExist) {
		return utils.NewAppError("That file doesn't exist.", http.StatusNotFound, "FILE_NOT_FOUND")
	}
	if err != nil {
		return fmt.Errorf("failed to read file: %v", err)
	}
	if !info.Mode().IsRegular() {
		return utils.BadRequest("Only a file can be copied, not a folder.", "NOT_A_FILE")
	}
	if info.Size() > maxCopy {
		return utils.BadRequest("That file is over 20 MB, too big for a skill.", "TOO_LARGE")
	}
	if src == dst {
		return utils.BadRequest("The file is already there.", "SAME_FILE")
	}
	if _, err := os.Stat(dst); err == nil && !overwrite {
		return utils.NewAppError("A file with that name already exists", http.StatusConflict, "FILE_EXISTS")
	}
	data, err := os.ReadFile(src)
	if err != nil {
		return fmt.Errorf("failed to read file: %v", err)
	}
	if err := utils.WriteFileAtomic(dst, data); err != nil {
		return fmt.Errorf("failed to write file: %v", err)
	}
	if info.Mode()&0o111 != 0 { // keep a script runnable
		_ = os.Chmod(dst, info.Mode().Perm())
	}
	s.logger.Info("Copied %s to %s", src, dst)
	return nil
}

// ResolvePath validates and translates a user-provided path string. It
// accepts Linux, macOS and Windows path formats, translates Windows-style
// paths to /mnt/<drive>/... when running in WSL, expands "~", rejects
// path-traversal attempts, and reports whether the resolved location
// exists and whether it is a file or directory.
//
// The frontend uses the result to navigate: directories become the new
// browse root, while files cause navigation to their parent directory so
// the file can be highlighted there.
func (s *FileExplorerService) ResolvePath(rawPath string) *utils.PathResolution {
	res := utils.ResolvePath(rawPath, s.isWSL)
	if res.Valid {
		s.logger.Info("Path resolved: input=%q -> %s (type=%s)", rawPath, res.ResolvedPath, res.Type)
	} else {
		s.logger.Warn("Path resolution failed: input=%q error=%s", rawPath, res.Error)
	}
	return &res
}
