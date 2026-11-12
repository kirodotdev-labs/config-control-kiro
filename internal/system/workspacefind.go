package system

import (
	"io/fs"
	"path/filepath"
	"sort"
	"strings"
)

// Limits for the workspace walk, so a huge repository never slows the
// navigator: Kiro's own discovery has no such limits, so results past them
// are simply not shown.
const (
	findMaxDepth   = 8
	findMaxDirs    = 4000
	findMaxResults = 100
)

// skipDirs are folders that hold dependencies or build output, never
// project instructions.
var skipDirs = map[string]bool{
	"node_modules": true, "vendor": true, "target": true, "dist": true, "build": true, "out": true,
	"__pycache__": true, "venv": true, ".venv": true, "bin": true, "obj": true,
}

// findInWorkspace returns, for each name, the slash-separated paths relative
// to root of files with that exact name (case-insensitive) in root or below.
// Hidden folders (including .git and .kiro) and dependency folders are skipped.
func findInWorkspace(root string, names ...string) map[string][]string {
	want := map[string]string{}
	for _, n := range names {
		want[strings.ToLower(n)] = n
	}
	out := map[string][]string{}
	dirs, total := 0, 0
	_ = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		rel, _ := filepath.Rel(root, path)
		rel = filepath.ToSlash(rel)
		if d.IsDir() {
			if path == root {
				return nil
			}
			name := d.Name()
			if strings.HasPrefix(name, ".") || skipDirs[strings.ToLower(name)] || strings.Count(rel, "/") >= findMaxDepth {
				return filepath.SkipDir
			}
			if dirs++; dirs > findMaxDirs {
				return filepath.SkipAll
			}
			return nil
		}
		if n, ok := want[strings.ToLower(d.Name())]; ok {
			out[n] = append(out[n], rel)
			if total++; total >= findMaxResults {
				return filepath.SkipAll
			}
		}
		return nil
	})
	for _, list := range out {
		sort.Slice(list, func(i, j int) bool {
			if a, b := strings.Count(list[i], "/"), strings.Count(list[j], "/"); a != b {
				return a < b
			}
			return list[i] < list[j]
		})
	}
	return out
}

// agentsMDNode is an AGENTS.md file in the workspace, listed under Steering.
// Kiro always includes these (they have no inclusion modes).
func agentsMDNode(root, rel string) *SurfaceNode {
	name := rel
	if dir := filepath.ToSlash(filepath.Dir(filepath.FromSlash(rel))); dir == "." {
		name = "AGENTS.md (project root)"
	} else {
		name = "AGENTS.md (" + dir + ")"
	}
	return &SurfaceNode{ID: "agentsmd:" + rel, Name: name, Kind: KindFile, Path: filepath.Join(root, filepath.FromSlash(rel)), Format: "md", Exists: true}
}
