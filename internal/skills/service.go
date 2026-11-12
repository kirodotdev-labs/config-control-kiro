// Package skills reads and imports Agent Skills: folders under the scope's
// skills directory, each with a SKILL.md whose front matter names the skill
// and says when Kiro should use it (kiro.dev/docs/skills, agentskills.io).
package skills

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"kiromanager/internal/shared/ghfolder"
	"kiromanager/internal/shared/miniyaml"
	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

// nameRule is the specification's constraint on a skill name (and its folder).
var nameRule = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// Service lists and imports skills for the active scope.
type Service struct {
	kiro   *system.KiroService
	logger *utils.Logger
	fetch  *ghfolder.Fetcher // for GitHub imports; tests replace its client
}

// NewService creates a skills Service. client may be nil (a default is used).
func NewService(kiro *system.KiroService, logger *utils.Logger, client *http.Client) *Service {
	return &Service{kiro: kiro, logger: logger, fetch: ghfolder.New(client)}
}

// Skill is one skill folder as the UI shows it.
type Skill struct {
	Name        string             `json:"name"` // the folder name
	Dir         string             `json:"dir"`
	Path        string             `json:"path"` // SKILL.md
	Description string             `json:"description"`
	Problems    []string           `json:"problems"` // what Kiro would reject or ignore
	Files       []system.SkillFile `json:"files"`    // everything beside SKILL.md
}

// List returns the skills of the active scope, sorted by name.
func (s *Service) List() []Skill {
	dir := s.kiro.SkillsDir()
	entries, _ := os.ReadDir(dir)
	out := []Skill{}
	for _, e := range entries {
		if !e.IsDir() || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		if sk, ok := s.read(filepath.Join(dir, e.Name())); ok {
			out = append(out, sk)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// Get returns one skill by folder name.
func (s *Service) Get(name string) (*Skill, error) {
	if !nameRule.MatchString(name) {
		return nil, utils.BadRequest("Not a skill name", "INVALID_NAME")
	}
	sk, ok := s.read(filepath.Join(s.kiro.SkillsDir(), name))
	if !ok {
		return nil, utils.NewAppError("No skill with that name here.", http.StatusNotFound, "SKILL_NOT_FOUND")
	}
	return &sk, nil
}

// read describes the skill folder dir; ok is false when it has no SKILL.md.
func (s *Service) read(dir string) (Skill, bool) {
	skillFile := filepath.Join(dir, "SKILL.md")
	data, err := os.ReadFile(skillFile)
	if err != nil {
		return Skill{}, false
	}
	sk := Skill{Name: filepath.Base(dir), Dir: dir, Path: skillFile, Problems: []string{}, Files: system.SkillFiles(dir)}
	front, _, ok := splitFrontmatter(string(data))
	if !ok {
		sk.Problems = append(sk.Problems, "SKILL.md has no front matter (--- name and description ---), so Kiro skips it")
		return sk, true
	}
	meta, err := miniyaml.Decode(front)
	if err != nil {
		sk.Problems = append(sk.Problems, "the front matter isn't valid YAML, so Kiro skips it")
		return sk, true
	}
	name, _ := meta["name"].(string)
	desc, _ := meta["description"].(string)
	sk.Description = strings.TrimSpace(desc)
	switch {
	case name == "":
		sk.Problems = append(sk.Problems, "name is missing")
	case name != sk.Name:
		sk.Problems = append(sk.Problems, fmt.Sprintf("name %q must match the folder name %q", name, sk.Name))
	case !nameRule.MatchString(name) || len(name) > 64:
		sk.Problems = append(sk.Problems, "name must be lowercase letters, numbers and hyphens, at most 64 characters")
	}
	if sk.Description == "" {
		sk.Problems = append(sk.Problems, "description is missing, so Kiro never activates it")
	} else if len(sk.Description) > 1024 {
		sk.Problems = append(sk.Problems, "description is over 1024 characters")
	}
	return sk, true
}

// splitFrontmatter returns the YAML between the leading --- fences and the body.
func splitFrontmatter(src string) (string, string, bool) {
	s := strings.TrimPrefix(src, "\ufeff")
	if !strings.HasPrefix(s, "---\n") && !strings.HasPrefix(s, "---\r\n") {
		return "", "", false
	}
	rest := s[strings.Index(s, "\n")+1:]
	lines := strings.SplitAfter(rest, "\n")
	off := 0
	for _, ln := range lines {
		if strings.TrimRight(ln, "\r\n") == "---" {
			return rest[:off], rest[off+len(ln):], true
		}
		off += len(ln)
	}
	return "", "", false
}

// Import copies a skill folder into the scope's skills directory from a
// GitHub folder URL (https://github.com/owner/repo/tree/branch/path, or the
// URL of its SKILL.md) or a local folder path. The folder must hold a
// SKILL.md; the skill's name is its folder name. Returns the imported skill.
func (s *Service) Import(source string) (*Skill, error) {
	source = strings.TrimSpace(source)
	if source == "" {
		return nil, utils.BadRequest("Paste a GitHub folder URL or a local folder path", "MISSING_SOURCE")
	}
	var files ghfolder.Files
	var name string
	var err error
	if ghfolder.IsURL(source) {
		name, files, err = s.fetch.Fetch(source, "skill", "SKILL.md")
	} else {
		name, files, err = ghfolder.ReadLocal(source, "skill")
	}
	if err != nil {
		return nil, err
	}
	if _, ok := files["SKILL.md"]; !ok {
		return nil, utils.BadRequest("That folder has no SKILL.md, so it isn't a skill", "NOT_A_SKILL")
	}
	if !nameRule.MatchString(name) || len(name) > 64 {
		return nil, utils.BadRequest(fmt.Sprintf("The folder name %q isn't a valid skill name (lowercase letters, numbers and hyphens)", name), "INVALID_NAME")
	}
	dest := filepath.Join(s.kiro.SkillsDir(), name)
	if _, err := os.Stat(dest); err == nil {
		return nil, utils.NewAppError(fmt.Sprintf("A skill called %s already exists here. Delete it first to replace it.", name), http.StatusConflict, "SKILL_EXISTS")
	}
	if err := files.Write(dest); err != nil {
		return nil, err
	}
	s.logger.Info("Imported skill %s from %s", name, source)
	sk, _ := s.read(dest)
	return &sk, nil
}
