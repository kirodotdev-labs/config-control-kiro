// Package codeintel helps set up Kiro CLI's code intelligence for a Workspace
// (kiro.dev/docs/tools/code-intelligence): which languages the project uses,
// detected the way Kiro does (project files such as package.json or go.mod,
// and file extensions), and which language servers are installed on this
// computer. The servers themselves are configured in .kiro/settings/lsp.json,
// which the app edits as a file; Kiro starts them.
package codeintel

import (
	"io/fs"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	"kiromanager/internal/system"
)

// languages are Kiro's built-in language servers: the project files and
// extensions that mark each language (Kiro's own defaults for lsp.json).
var languages = map[string]struct{ markers, exts []string }{
	"typescript": {[]string{"package.json", "tsconfig.json"}, []string{".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"}},
	"rust":       {[]string{"Cargo.toml"}, []string{".rs"}},
	"python":     {[]string{"pyproject.toml", "setup.py", "requirements.txt", "pyrightconfig.json"}, []string{".py", ".pyi"}},
	"go":         {[]string{"go.mod", "go.sum"}, []string{".go"}},
	"java":       {[]string{"pom.xml", "build.gradle", "build.gradle.kts"}, []string{".java"}},
	"ruby":       {[]string{"Gemfile", "Rakefile"}, []string{".rb"}},
	"cpp":        {[]string{"CMakeLists.txt", "compile_commands.json"}, []string{".cpp", ".cc", ".cxx", ".c", ".h", ".hpp", ".hxx"}},
	"kotlin":     {[]string{"settings.gradle.kts"}, []string{".kt", ".kts"}},
}

// skipDirs are folders Kiro's defaults exclude, plus version control.
var skipDirs = map[string]bool{".git": true, "node_modules": true, "dist": true, "target": true, "build": true, "vendor": true, "__pycache__": true, "venv": true, ".venv": true, ".gradle": true, ".kiro": true}

// maxScan bounds the project walk, so a huge repository stays quick.
const maxScan = 20000

// Info is what the Code intelligence page needs: the languages found in the
// Workspace, and whether each asked-for command is on PATH.
type Info struct {
	Detected  []string        `json:"detected"`
	Installed map[string]bool `json:"installed"`
}

// Service answers for the active Workspace.
type Service struct {
	kiro     *system.KiroService
	lookPath func(string) (string, error)
}

// NewService creates a codeintel Service.
func NewService(kiro *system.KiroService) *Service {
	return &Service{kiro: kiro, lookPath: exec.LookPath}
}

// Info detects the Workspace's languages and checks the given commands.
func (s *Service) Info(commands []string) Info {
	out := Info{Detected: []string{}, Installed: map[string]bool{}}
	for _, c := range commands {
		if c = strings.TrimSpace(c); c != "" {
			_, err := s.lookPath(c)
			out.Installed[c] = err == nil
		}
	}
	if s.kiro.GetMode() == system.ModeWorkspace {
		out.Detected = detect(s.kiro.GetActiveWorkspace())
	}
	return out
}

// detect returns the languages whose project files or extensions appear in root.
func detect(root string) []string {
	found := map[string]bool{}
	byMarker, byExt := map[string]string{}, map[string]string{}
	for lang, l := range languages {
		for _, m := range l.markers {
			byMarker[m] = lang
		}
		for _, e := range l.exts {
			byExt[e] = lang
		}
	}
	n := 0
	_ = filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			if p != root && (skipDirs[d.Name()] || strings.HasPrefix(d.Name(), ".")) {
				return filepath.SkipDir
			}
			return nil
		}
		if n++; n > maxScan {
			return filepath.SkipAll
		}
		if lang, ok := byMarker[d.Name()]; ok {
			found[lang] = true
		}
		if lang, ok := byExt[strings.ToLower(filepath.Ext(d.Name()))]; ok {
			found[lang] = true
		}
		return nil
	})
	out := make([]string, 0, len(found))
	for l := range found {
		out = append(out, l)
	}
	sort.Strings(out)
	return out
}
