package fileexplorer

// BrowseRequest is the request payload for browsing a directory.
type BrowseRequest struct {
	Path   string   `json:"path"`
	Filter []string `json:"filter"` // e.g. [".md", ".txt"] or ["*"]
}

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

// CreateFolderRequest is the request payload for creating a directory.
type CreateFolderRequest struct {
	Path string `json:"path"`
}

// CreateFileRequest is the request payload for creating or overwriting a file.
type CreateFileRequest struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

// CutRequest is the request payload for moving a file or directory.
type CutRequest struct {
	Source string `json:"source"`
	Dest   string `json:"dest"`
}

// CopyRequest is the request payload for copying a file or directory.
type CopyRequest struct {
	Source string `json:"source"`
	Dest   string `json:"dest"`
}

// RenameRequest is the request payload for renaming a file or directory.
type RenameRequest struct {
	Path    string `json:"path"`
	NewName string `json:"newName"`
}

// DeleteRequest is the request payload for deleting a file or directory.
type DeleteRequest struct {
	Path string `json:"path"`
}

// BulkCopyRequest is the request payload for copying multiple sources to a destination.
type BulkCopyRequest struct {
	Sources []string `json:"sources"`
	Dest    string   `json:"dest"`
}

// BulkCutRequest is the request payload for moving multiple sources to a destination.
type BulkCutRequest struct {
	Sources []string `json:"sources"`
	Dest    string   `json:"dest"`
}

// BulkDeleteRequest is the request payload for deleting multiple paths.
type BulkDeleteRequest struct {
	Paths []string `json:"paths"`
}

// ConflictResolution specifies how to handle naming conflicts during bulk operations.
type ConflictResolution struct {
	Action string `json:"action"` // "overwrite", "rename", "skip"
}

// BulkOperationResponse reports the outcome of a bulk file operation.
type BulkOperationResponse struct {
	Success  []string          `json:"success"`
	Failed   []FailedOperation `json:"failed"`
	Conflicts []ConflictInfo   `json:"conflicts,omitempty"`
}

// FailedOperation records a path that failed during a bulk operation and the error.
type FailedOperation struct {
	Path  string `json:"path"`
	Error string `json:"error"`
}

// ConflictInfo describes a naming conflict between a source and destination path.
type ConflictInfo struct {
	Path     string `json:"path"`
	DestPath string `json:"destPath"`
	Exists   bool   `json:"exists"`
}

// ResolvePathRequest is the request payload for resolving and validating a
// user-provided path that may be in Linux, macOS or Windows format.
type ResolvePathRequest struct {
	Path string `json:"path"`
}
