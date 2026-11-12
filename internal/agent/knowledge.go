package agent

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"kiromanager/internal/shared/utils"
)

// FolderEstimate is a quick count of the files an agent knowledge base
// would cover, shown before Kiro indexes anything.
type FolderEstimate struct {
	Files     int   `json:"files"`
	Bytes     int64 `json:"bytes"`
	Truncated bool  `json:"truncated"` // stopped early; the real numbers are larger
	Missing   bool  `json:"missing"`   // the folder doesn't exist (an answer, not an error)
}

const (
	estimateMaxFiles = 100000
	estimateMaxTime  = 3 * time.Second
)

var errStopWalk = errors.New("stop")

// EstimateFolder counts the files a knowledge base with these patterns
// would cover. Patterns are globs relative to the folder: ** spans folders,
// and a pattern without a slash also matches a name at any depth. No include
// patterns means every file. .git folders are skipped. It is an estimate;
// Kiro may skip more (binary files, its own limits).
func EstimateFolder(folder string, include, exclude []string) (FolderEstimate, error) {
	if err := utils.ValidatePath(folder); err != nil {
		return FolderEstimate{}, err
	}
	folder = utils.ExpandHomePath(folder)
	if info, err := os.Stat(folder); err != nil || !info.IsDir() {
		return FolderEstimate{Missing: true}, nil
	}
	inc, exc := compileGlobs(include), compileGlobs(exclude)
	deadline := time.Now().Add(estimateMaxTime)
	var est FolderEstimate
	_ = filepath.WalkDir(folder, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			if d.Name() == ".git" {
				return filepath.SkipDir
			}
			return nil
		}
		rel, _ := filepath.Rel(folder, path)
		rel = filepath.ToSlash(rel)
		if (len(inc) > 0 && !anyMatch(inc, rel)) || anyMatch(exc, rel) {
			return nil
		}
		est.Files++
		if info, err := d.Info(); err == nil {
			est.Bytes += info.Size()
		}
		if est.Files >= estimateMaxFiles || (est.Files%500 == 0 && time.Now().After(deadline)) {
			est.Truncated = true
			return errStopWalk
		}
		return nil
	})
	return est, nil
}

// glob is one compiled pattern; nameOnly patterns (no slash) also match a
// single path segment, like gitignore.
type glob struct {
	re       *regexp.Regexp
	nameOnly bool
}

func compileGlobs(patterns []string) []glob {
	var out []glob
	for _, p := range patterns {
		p = strings.TrimPrefix(strings.TrimSpace(filepath.ToSlash(p)), "./")
		if p == "" {
			continue
		}
		out = append(out, glob{
			re:       regexp.MustCompile("^" + globToRegexp(p) + "$"),
			nameOnly: !strings.Contains(strings.TrimSuffix(p, "/"), "/"),
		})
	}
	return out
}

// globToRegexp supports **, * and ?, and a trailing / for a folder.
func globToRegexp(p string) string {
	var b strings.Builder
	for i := 0; i < len(p); i++ {
		switch c := p[i]; {
		case c == '*' && i+1 < len(p) && p[i+1] == '*':
			i++
			if i+1 < len(p) && p[i+1] == '/' {
				i++
				b.WriteString("(?:.*/)?")
			} else {
				b.WriteString(".*")
			}
		case c == '*':
			b.WriteString("[^/]*")
		case c == '?':
			b.WriteString("[^/]")
		case c == '/' && i == len(p)-1:
			b.WriteString("(?:/.*)?")
		default:
			b.WriteString(regexp.QuoteMeta(string(c)))
		}
	}
	return b.String()
}

// anyMatch reports whether rel matches a pattern: the whole path, or for a
// name-only pattern the file name or any folder above it.
func anyMatch(globs []glob, rel string) bool {
	parts := strings.Split(rel, "/")
	for _, g := range globs {
		if g.re.MatchString(rel) {
			return true
		}
		if g.nameOnly {
			for _, part := range parts {
				if g.re.MatchString(part) {
					return true
				}
			}
		}
	}
	return false
}
