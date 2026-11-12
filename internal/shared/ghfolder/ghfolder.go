// Package ghfolder reads a folder into memory, from a public GitHub URL or the
// local disk, with limits on size and file count and without following links
// or accepting unsafe paths. Skills and Powers use it to import a folder.
package ghfolder

import (
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"kiromanager/internal/shared/utils"
)

// Limits for a folder: instructions, small scripts and configuration, not a repository.
const (
	MaxFiles     = 200
	MaxFileBytes = 2 << 20 // 2 MiB per file
	MaxTotal     = 20 << 20
)

// Files is a folder's contents, by slash-separated path relative to the folder.
type Files map[string][]byte

// Fetcher downloads GitHub folders. Client may be replaced in tests.
type Fetcher struct{ Client *http.Client }

// New returns a Fetcher; client nil means a default with a timeout.
func New(client *http.Client) *Fetcher {
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}
	return &Fetcher{Client: client}
}

// IsURL reports whether source is a web address rather than a path.
func IsURL(source string) bool {
	return strings.HasPrefix(source, "http://") || strings.HasPrefix(source, "https://")
}

// Ref is the folder a GitHub URL points at.
type Ref struct{ Owner, Repo, Branch, Dir string }

// ParseURL accepts github.com/owner/repo/tree/<branch>/<dir>, or the URL of a
// file in that folder when its base name is one of files (e.g. SKILL.md).
// The repository root is refused. what names the thing, for messages.
func ParseURL(raw, what string, files ...string) (*Ref, error) {
	u, err := url.Parse(raw)
	if err != nil || u.Host != "github.com" && u.Host != "www.github.com" {
		return nil, utils.BadRequest("Only github.com URLs can be imported", "NOT_GITHUB")
	}
	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	if len(parts) < 5 || (parts[2] != "tree" && parts[2] != "blob") {
		return nil, utils.BadRequest(fmt.Sprintf("Use the URL of the %s's folder in the repository (…/tree/<branch>/<folder>), not the repository root", what), "NOT_A_FOLDER_URL")
	}
	dir := strings.Join(parts[4:], "/")
	if parts[2] == "blob" {
		ok := false
		for _, f := range files {
			ok = ok || path.Base(dir) == f
		}
		if !ok {
			return nil, utils.BadRequest(fmt.Sprintf("A file URL must point at %s", strings.Join(files, " or ")), "NOT_A_FOLDER_URL")
		}
		dir = path.Dir(dir)
	}
	if dir == "" || dir == "." {
		return nil, utils.BadRequest(fmt.Sprintf("Use the URL of the %s's folder, not the repository root", what), "NOT_A_FOLDER_URL")
	}
	return &Ref{Owner: parts[0], Repo: parts[1], Branch: parts[3], Dir: dir}, nil
}

// Fetch downloads the folder a GitHub URL points at. It returns the folder's name.
func (f *Fetcher) Fetch(raw, what string, files ...string) (string, Files, error) {
	ref, err := ParseURL(raw, what, files...)
	if err != nil {
		return "", nil, err
	}
	out := Files{}
	var total int64
	if err := f.fetchDir(ref, ref.Dir, out, &total, what); err != nil {
		return "", nil, err
	}
	return path.Base(ref.Dir), out, nil
}

type entry struct {
	Type        string `json:"type"`
	Path        string `json:"path"`
	DownloadURL string `json:"download_url"`
	Size        int64  `json:"size"`
}

// fetchDir lists one directory through the contents API and fetches its files.
func (f *Fetcher) fetchDir(ref *Ref, dir string, out Files, total *int64, what string) error {
	api := fmt.Sprintf("https://api.github.com/repos/%s/%s/contents/%s?ref=%s", url.PathEscape(ref.Owner), url.PathEscape(ref.Repo), dir, url.QueryEscape(ref.Branch))
	body, err := f.get(api, 1<<20)
	if err != nil {
		return err
	}
	var entries []entry
	if err := json.Unmarshal(body, &entries); err != nil {
		return utils.BadRequest("GitHub didn't return a folder listing. Check the URL points at a folder in a public repository.", "GITHUB_NOT_FOLDER")
	}
	for _, e := range entries {
		rel := strings.TrimPrefix(strings.TrimPrefix(e.Path, ref.Dir), "/")
		switch e.Type {
		case "dir":
			if err := f.fetchDir(ref, e.Path, out, total, what); err != nil {
				return err
			}
		case "file":
			if e.Size > MaxFileBytes {
				return utils.BadRequest(rel+" is larger than 2 MB", "FILE_TOO_LARGE")
			}
			data, err := f.get(e.DownloadURL, MaxFileBytes+1)
			if err != nil {
				return err
			}
			if err := add(out, total, rel, data, what); err != nil {
				return err
			}
		}
	}
	return nil
}

// get fetches a GitHub URL (https only) up to limit bytes.
func (f *Fetcher) get(raw string, limit int64) ([]byte, error) {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || !strings.HasSuffix(u.Host, "github.com") && !strings.HasSuffix(u.Host, "githubusercontent.com") {
		return nil, utils.BadRequest("Refusing to download from "+raw, "UNSAFE_URL")
	}
	req, _ := http.NewRequest(http.MethodGet, raw, nil)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "cckiro")
	resp, err := f.Client.Do(req)
	if err != nil {
		return nil, utils.NewAppError("Couldn't reach GitHub: "+err.Error(), http.StatusBadGateway, "GITHUB_UNREACHABLE")
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil, utils.NewAppError("GitHub has nothing at that URL. Check the repository, branch and folder.", http.StatusNotFound, "GITHUB_NOT_FOUND")
	}
	if resp.StatusCode != http.StatusOK {
		return nil, utils.NewAppError(fmt.Sprintf("GitHub answered %d", resp.StatusCode), http.StatusBadGateway, "GITHUB_ERROR")
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, limit))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) >= limit && limit > 0 {
		return nil, utils.BadRequest("A file in the folder is too large", "FILE_TOO_LARGE")
	}
	return data, nil
}

// ReadLocal reads a folder from disk, with the same limits. It returns the folder's name.
func ReadLocal(dir, what string) (string, Files, error) {
	dir = utils.ExpandHomePath(dir)
	if err := utils.ValidatePath(dir); err != nil {
		return "", nil, err
	}
	info, err := os.Stat(dir)
	if err != nil || !info.IsDir() {
		return "", nil, utils.BadRequest("That path isn't a folder", "NOT_A_FOLDER")
	}
	out := Files{}
	var total int64
	err = filepath.WalkDir(dir, func(p string, d fs.DirEntry, werr error) error {
		if werr != nil {
			return werr
		}
		if d.Type()&fs.ModeSymlink != 0 {
			return nil // never follow links out of the folder
		}
		if strings.HasPrefix(d.Name(), ".") && p != dir {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if d.IsDir() {
			return nil
		}
		rel, _ := filepath.Rel(dir, p)
		data, rerr := os.ReadFile(p)
		if rerr != nil {
			return rerr
		}
		return add(out, &total, filepath.ToSlash(rel), data, what)
	})
	if err != nil {
		return "", nil, err
	}
	return filepath.Base(dir), out, nil
}

// add stores one file, enforcing the limits and a safe relative path.
func add(out Files, total *int64, rel string, data []byte, what string) error {
	if rel == "" || strings.HasPrefix(rel, "/") || strings.Contains(rel, "..") {
		return utils.BadRequest(fmt.Sprintf("The %s contains an unsafe path: %s", what, rel), "UNSAFE_PATH")
	}
	if len(out) >= MaxFiles {
		return utils.BadRequest(fmt.Sprintf("The %s has more than %d files", what, MaxFiles), "TOO_MANY_FILES")
	}
	if int64(len(data)) > MaxFileBytes {
		return utils.BadRequest(rel+" is larger than 2 MB", "FILE_TOO_LARGE")
	}
	*total += int64(len(data))
	if *total > MaxTotal {
		return utils.BadRequest(fmt.Sprintf("The %s is larger than 20 MB", what), "TOO_LARGE")
	}
	out[rel] = data
	return nil
}

// Write saves files under dest, removing dest again if any write fails.
func (fs Files) Write(dest string) error {
	for rel, data := range fs {
		if err := utils.WriteFileAtomic(filepath.Join(dest, filepath.FromSlash(rel)), data); err != nil {
			_ = os.RemoveAll(dest)
			return fmt.Errorf("failed to write %s: %v", rel, err)
		}
	}
	return nil
}
