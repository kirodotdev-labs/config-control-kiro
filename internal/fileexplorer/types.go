// Package fileexplorer reads, writes, browses and resolves files for the editors.
package fileexplorer

// BrowseResponse contains the directory listing results.
type BrowseResponse struct {
	Path    string       `json:"path"`
	Folders []FolderInfo `json:"folders"`
	Files   []FileInfo   `json:"files"`
}

// FolderInfo describes a directory entry.
type FolderInfo struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

// FileInfo describes a file entry with metadata.
type FileInfo struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	Size     int64  `json:"size"`
	Modified string `json:"modified"`
}

// CreateFileRequest is the request payload for writing a file. With
// CreateOnly set, an existing file is never overwritten (409 FILE_EXISTS).
type CreateFileRequest struct {
	Path       string `json:"path"`
	Content    string `json:"content"`
	CreateOnly bool   `json:"createOnly,omitempty"`
}

// CopyFileRequest is the request payload for copying an existing file into a
// Kiro folder, such as a skill's scripts/.
type CopyFileRequest struct {
	Source    string `json:"source"`
	Dest      string `json:"dest"`
	Overwrite bool   `json:"overwrite,omitempty"`
}

// ResolvePathRequest is the request payload for resolving and validating a
// user-provided path that may be in Linux, macOS or Windows format.
type ResolvePathRequest struct {
	Path string `json:"path"`
}
