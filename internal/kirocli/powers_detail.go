package kirocli

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"kiromanager/internal/shared/miniyaml"
	"kiromanager/internal/shared/utils"
)

// A power is a folder (kiro.dev/docs/powers): a manifest, plugin.json (the
// Agent Plugins format) or POWER.md (the original format, YAML front matter
// then instructions), with optional mcp.json, skills/ and steering/. Kiro
// installs a copy into <Kiro home>/powers/installed/<name>/.

// Manifest is what a power says about itself.
type Manifest struct {
	Format      string   `json:"format"` // "plugin.json" or "POWER.md"
	Name        string   `json:"name"`
	DisplayName string   `json:"displayName,omitempty"`
	Version     string   `json:"version,omitempty"`
	Description string   `json:"description,omitempty"`
	Author      string   `json:"author,omitempty"`
	Keywords    []string `json:"keywords"`
	Homepage    string   `json:"homepage,omitempty"`
	Repository  string   `json:"repository,omitempty"`
	License     string   `json:"license,omitempty"`
}

// PowerServer is one MCP server a power brings.
type PowerServer struct {
	Name     string `json:"name"`
	Summary  string `json:"summary"` // its command line or URL
	Disabled bool   `json:"disabled,omitempty"`
}

// PowerFile is one file in a power folder.
type PowerFile struct {
	Rel  string `json:"rel"`
	Path string `json:"path"`
	Size int64  `json:"size"`
}

// PowerDetail is everything inside a power folder.
type PowerDetail struct {
	Dir          string        `json:"dir"`
	Manifest     Manifest      `json:"manifest"`
	Servers      []PowerServer `json:"servers"`
	Skills       []string      `json:"skills"`       // plugin.json powers: skill folder names under skills/
	Steering     []string      `json:"steering"`     // steering files, relative to the power: dev.kiro/steering/ (plugin.json) or steering/ (POWER.md)
	SteeringDir  string        `json:"steeringDir"`  // where Kiro reads this power's steering, relative to the power
	Instructions string        `json:"instructions"` // the power's instructions file: dev.kiro/INSTRUCTIONS.md (plugin.json) or POWER.md
	Files        []PowerFile   `json:"files"`
	Problems     []string      `json:"problems"`
	Installed    bool          `json:"installed"` // the folder is Kiro's installed copy
}

// ReadPower describes the power in dir. ok is false when dir has no manifest.
func ReadPower(dir string) (PowerDetail, bool) {
	d := PowerDetail{Dir: dir, Servers: []PowerServer{}, Skills: []string{}, Steering: []string{}, Files: []PowerFile{}, Problems: []string{}}
	if data, err := os.ReadFile(filepath.Join(dir, "plugin.json")); err == nil {
		d.Manifest = readPluginJSON(data, &d.Problems)
	} else if data, err := os.ReadFile(filepath.Join(dir, "POWER.md")); err == nil {
		d.Manifest = readPowerMD(string(data), &d.Problems)
	} else {
		return d, false
	}
	if d.Manifest.Keywords == nil {
		d.Manifest.Keywords = []string{}
	}
	if data, err := os.ReadFile(filepath.Join(dir, "mcp.json")); err == nil {
		var cfg struct {
			MCPServers map[string]struct {
				Command  string   `json:"command"`
				Args     []string `json:"args"`
				URL      string   `json:"url"`
				Disabled bool     `json:"disabled"`
			} `json:"mcpServers"`
		}
		if json.Unmarshal(data, &cfg) != nil {
			d.Problems = append(d.Problems, "mcp.json isn't valid JSON, so Kiro can't start its servers")
		}
		for name, s := range cfg.MCPServers {
			sum := s.URL
			if sum == "" {
				sum = strings.TrimSpace(s.Command + " " + strings.Join(s.Args, " "))
			}
			d.Servers = append(d.Servers, PowerServer{Name: name, Summary: sum, Disabled: s.Disabled})
		}
		sort.Slice(d.Servers, func(i, j int) bool { return d.Servers[i].Name < d.Servers[j].Name })
	}
	// Where Kiro reads guidance depends on the format (Kiro's PowersManager):
	// an Agent Plugin keeps steering and INSTRUCTIONS.md in dev.kiro/ and skills
	// in skills/; a POWER.md power keeps steering/ and its instructions in POWER.md, and has no skills.
	plugin := d.Manifest.Format == "plugin.json"
	d.SteeringDir, d.Instructions = "steering", "POWER.md"
	if plugin {
		d.SteeringDir, d.Instructions = "dev.kiro/steering", "dev.kiro/INSTRUCTIONS.md"
	}
	if entries, err := os.ReadDir(filepath.Join(dir, filepath.FromSlash(d.SteeringDir))); err == nil {
		for _, e := range entries {
			if !e.IsDir() && strings.HasSuffix(e.Name(), ".md") && !strings.HasPrefix(e.Name(), ".") {
				d.Steering = append(d.Steering, d.SteeringDir+"/"+e.Name())
			}
		}
	}
	if !plugin {
		if _, err := os.Stat(filepath.Join(dir, "skills")); err == nil {
			d.Problems = append(d.Problems, "This power uses POWER.md, so Kiro ignores its skills/ folder. Skills need the plugin.json format")
		}
	}
	if entries, err := os.ReadDir(filepath.Join(dir, "skills")); plugin && err == nil {
		for _, e := range entries {
			if _, err := os.Stat(filepath.Join(dir, "skills", e.Name(), "SKILL.md")); e.IsDir() && err == nil {
				d.Skills = append(d.Skills, e.Name())
			}
		}
	}
	_ = filepath.WalkDir(dir, func(p string, e os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if strings.HasPrefix(e.Name(), ".") && p != dir {
			if e.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if e.IsDir() {
			return nil
		}
		rel, _ := filepath.Rel(dir, p)
		rel = filepath.ToSlash(rel)
		var size int64
		if info, ierr := e.Info(); ierr == nil {
			size = info.Size()
		}
		d.Files = append(d.Files, PowerFile{Rel: rel, Path: p, Size: size})
		return nil
	})
	sort.Slice(d.Files, func(i, j int) bool { return d.Files[i].Rel < d.Files[j].Rel })
	d.Problems = append(d.Problems, manifestProblems(d.Manifest)...)
	return d, true
}

func readPluginJSON(data []byte, problems *[]string) Manifest {
	m := Manifest{Format: "plugin.json"}
	var raw map[string]any
	if json.Unmarshal(data, &raw) != nil {
		*problems = append(*problems, "plugin.json isn't valid JSON")
		return m
	}
	m.Name, _ = raw["name"].(string)
	m.DisplayName, _ = raw["displayName"].(string)
	m.Version, _ = raw["version"].(string)
	m.Description, _ = raw["description"].(string)
	m.Homepage, _ = raw["homepage"].(string)
	m.License, _ = raw["license"].(string)
	switch a := raw["author"].(type) {
	case map[string]any:
		m.Author, _ = a["name"].(string)
	case string:
		m.Author = a
	}
	switch r := raw["repository"].(type) {
	case string:
		m.Repository = r
	case map[string]any:
		m.Repository, _ = r["url"].(string)
	}
	m.Keywords = strings_(raw["keywords"])
	return m
}

func readPowerMD(text string, problems *[]string) Manifest {
	m := Manifest{Format: "POWER.md"}
	front, _, ok := splitFront(text)
	if !ok {
		*problems = append(*problems, "POWER.md has no front matter (--- name, description, keywords ---)")
		return m
	}
	meta, err := miniyaml.Decode(front)
	if err != nil {
		*problems = append(*problems, "POWER.md's front matter isn't valid YAML")
		return m
	}
	m.Name, _ = meta["name"].(string)
	m.DisplayName, _ = meta["displayName"].(string)
	m.Description, _ = meta["description"].(string)
	m.Author, _ = meta["author"].(string)
	m.Version, _ = meta["version"].(string)
	m.Keywords = strings_(meta["keywords"])
	return m
}

// manifestProblems checks the docs' required fields (kiro.dev/docs/powers/create).
func manifestProblems(m Manifest) []string {
	var out []string
	switch {
	case m.Name == "":
		out = append(out, "name is required")
	case !powerName.MatchString(m.Name) || strings.ToLower(m.Name) != m.Name || strings.Contains(m.Name, "_"):
		out = append(out, "name must be kebab-case: lowercase letters, numbers and hyphens")
	}
	if m.Description == "" {
		out = append(out, "description is required")
	}
	if len(m.Keywords) == 0 {
		out = append(out, "keywords are required: without them Kiro never loads the power")
	}
	if m.Format == "plugin.json" {
		if m.Version == "" {
			out = append(out, "version is required (e.g. 1.0.0)")
		}
		if m.Author == "" {
			out = append(out, "author.name is required")
		}
	}
	return out
}

func strings_(v any) []string {
	list, _ := v.([]any)
	out := []string{}
	for _, x := range list {
		if s, ok := x.(string); ok && strings.TrimSpace(s) != "" {
			out = append(out, s)
		}
	}
	return out
}

// splitFront returns the YAML between leading --- fences and the rest.
func splitFront(src string) (string, string, bool) {
	s := strings.TrimPrefix(strings.ReplaceAll(src, "\r\n", "\n"), "\ufeff")
	if !strings.HasPrefix(s, "---\n") {
		return "", "", false
	}
	end := strings.Index(s[4:], "\n---")
	if end < 0 {
		return "", "", false
	}
	return s[4 : 4+end], strings.TrimPrefix(s[4+end+4:], "\n"), true
}

// SourcesDir is where the app keeps power folders you create: Kiro reads a
// power from any folder and installs a copy, so the source sits beside Kiro's
// own files, outside powers/ (which Kiro manages).
func SourcesDir(kiroHome string) string { return filepath.Join(kiroHome, "power-sources") }

// PowerSources lists the power folders in SourcesDir.
func PowerSources(kiroHome string) []PowerDetail {
	out := []PowerDetail{}
	entries, _ := os.ReadDir(SourcesDir(kiroHome))
	for _, e := range entries {
		if !e.IsDir() || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		if d, ok := ReadPower(filepath.Join(SourcesDir(kiroHome), e.Name())); ok {
			out = append(out, d)
		}
	}
	return out
}

// InstalledPower describes one installed power by name.
func InstalledPower(kiroHome, name string) (*PowerDetail, error) {
	if !powerName.MatchString(name) {
		return nil, utils.BadRequest("That isn't a valid power name.", "INVALID_POWER")
	}
	d, ok := ReadPower(filepath.Join(kiroHome, "powers", "installed", name))
	if !ok {
		return nil, utils.NewAppError("No installed power with that name.", http.StatusNotFound, "POWER_NOT_FOUND")
	}
	d.Installed = true
	return &d, nil
}

// PowerSource describes a power folder you keep yourself (to edit, then install).
func PowerSource(dir string) (*PowerDetail, error) {
	if err := utils.ValidatePath(dir); err != nil {
		return nil, err
	}
	d, ok := ReadPower(utils.ExpandHomePath(dir))
	if !ok {
		return nil, utils.BadRequest("That folder has no plugin.json or POWER.md, so it isn't a power.", "INVALID_POWER")
	}
	return &d, nil
}

// InstallFromGitHub downloads a power folder from a GitHub URL into a temporary
// folder, installs it with kiro-cli, and removes the temporary copy.
func (s *Service) InstallFromGitHub(url string) (string, error) {
	name, files, err := s.fetch.Fetch(url, "power", "plugin.json", "POWER.md")
	if err != nil {
		return "", err
	}
	if _, ok := files["plugin.json"]; !ok {
		if _, ok := files["POWER.md"]; !ok {
			return "", utils.BadRequest("That folder has no plugin.json or POWER.md, so it isn't a power. A repository can hold several powers: use the URL of one power's folder.", "INVALID_POWER")
		}
	}
	tmp, err := os.MkdirTemp("", "cckiro-power-")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(tmp)
	dir := filepath.Join(tmp, name)
	if err := files.Write(dir); err != nil {
		return "", err
	}
	return s.runPowers("install", dir)
}
