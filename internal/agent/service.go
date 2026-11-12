// Package agent manages Kiro agent specs (.kiro/agents/*.json and *.md).
//
// An agent is identified by its file name without extension (its id), which
// may differ from the "name" field inside the spec. Specs are handled as whole
// ordered documents: the editor receives every field in file order and saves
// the complete document back, so unknown/V3 fields, deletions, and key order
// all round-trip exactly. kiro-cli rejects specs with unknown keys, so this
// fidelity matters: Config Control must never add, drop, or reorder silently.
package agent

import (
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"kiromanager/internal/kirocli"
	"kiromanager/internal/shared/ordered"
	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

// Summary is the lightweight view of an agent used by lists.
type Summary struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description,omitempty"`
	Model       string    `json:"model,omitempty"`
	ToolCount   int       `json:"toolCount"`
	Format      string    `json:"format"`
	V3          Readiness `json:"v3"` // 2.x: whether a 2.x config needs Kiro's upgrade (readiness_v2.go)
	// OverridesGlobal is set in a Workspace when a Global agent has the same
	// id: Kiro uses this one and warns.
	OverridesGlobal bool `json:"overridesGlobal,omitempty"`
}

// AgentService reads and writes agent specs for the active scope.
type AgentService struct {
	kiro     *system.KiroService
	logger   *utils.Logger
	cli      *kirocli.Runner // 2.x: runs `kiro-cli agent upgrade` (upgrade_v2.go, kirostate_v2.go)
	states   kiroStates      // 2.x: Kiro's upgrade verdict per agent
	measurer Measurer        // lists MCP servers' tools to measure them
}

// NewAgentService creates an AgentService.
func NewAgentService(kiro *system.KiroService, logger *utils.Logger, cli *kirocli.Runner, measurer Measurer) *AgentService {
	return &AgentService{kiro: kiro, logger: logger, cli: cli, measurer: measurer}
}

// List returns a summary of every agent spec in the active scope, by id.
func (s *AgentService) List() []Summary {
	out := []Summary{}
	kiroStates := s.kiroStatesFor(s.kiro.AgentsDir()) // 2.x: remove with V2 support
	for _, file := range specFiles(s.kiro.AgentsDir()) {
		path := filepath.Join(s.kiro.AgentsDir(), file)
		doc, err := readDocument(path)
		if err != nil {
			s.logger.Warn("Skipping unreadable agent %s: %v", file, err)
			continue
		}
		sum := summarize(stem(file), doc)
		view, _ := doc.view()
		sum.V3 = readiness(path, view, doc.format) // 2.x: remove with V2 support
		if st, ok := kiroStates[file]; ok {
			sum.V3 = withKiroState(sum.V3, st)
		}
		sum.OverridesGlobal = s.kiro.GetMode() == system.ModeWorkspace && hasSpec(s.kiro.GlobalAgentsDir(), stem(file))
		out = append(out, sum)
	}
	return out
}

// Get returns the full spec for id as an ordered object.
func (s *AgentService) Get(id string) (*ordered.Object, error) {
	path, err := s.existingPath(id)
	if err != nil {
		return nil, err
	}
	doc, err := readDocument(path)
	if err != nil {
		return nil, err
	}
	return doc.view()
}

// Create writes a new JSON spec whose id is derived from its "name" field.
func (s *AgentService) Create(spec *ordered.Object) (string, error) {
	id := utils.SanitizeName(spec.String("name"))
	if id == "" {
		return "", utils.BadRequest("Agent name is required", "INVALID_AGENT")
	}
	if _, err := s.existingPath(id); err == nil {
		return "", utils.NewAppError("Agent '"+id+"' already exists", http.StatusConflict, "AGENT_EXISTS")
	}
	doc := &document{format: formatJSON, fields: spec}
	return id, doc.write(filepath.Join(s.kiro.AgentsDir(), id+".json"))
}

// Update replaces the spec for id with spec, keeping the file's format.
func (s *AgentService) Update(id string, spec *ordered.Object) error {
	path, err := s.existingPath(id)
	if err != nil {
		return err
	}
	doc, err := readDocument(path)
	if err != nil {
		return err
	}
	before, err := doc.signature()
	if err != nil {
		return err
	}
	if err := doc.apply(spec); err != nil {
		return err
	}
	if after, err := doc.signature(); err == nil && after == before {
		return nil // nothing changed: leave the file untouched
	}
	return doc.write(path)
}

// Delete removes the spec file for id.
func (s *AgentService) Delete(id string) error {
	path, err := s.existingPath(id)
	if err != nil {
		return err
	}
	return os.Remove(path)
}

// AllNames returns agent ids from the active scope plus global, deduplicated.
func (s *AgentService) AllNames() []string {
	seen := map[string]bool{}
	names := []string{}
	for _, dir := range []string{s.kiro.AgentsDir(), s.kiro.GlobalAgentsDir()} {
		for _, f := range specFiles(dir) {
			if id := stem(f); !seen[id] {
				seen[id] = true
				names = append(names, id)
			}
		}
	}
	return names
}

// existingPath resolves id to its spec file. JSON wins over Markdown when both
// exist, matching kiro-cli's resolution order.
func (s *AgentService) existingPath(id string) (string, error) {
	id = utils.SanitizeName(id)
	if id == "" {
		return "", utils.BadRequest("Agent id is required", "INVALID_AGENT")
	}
	for _, ext := range []string{".json", ".md"} {
		p := filepath.Join(s.kiro.AgentsDir(), id+ext)
		if info, err := os.Stat(p); err == nil && !info.IsDir() {
			return p, nil
		}
	}
	return "", utils.NewAppError("Agent '"+id+"' not found", http.StatusNotFound, "AGENT_NOT_FOUND")
}

// specFiles lists top-level .json/.md files in dir, sorted, one per id.
func specFiles(dir string) []string {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	byID := map[string]string{}
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || strings.HasPrefix(name, ".") {
			continue
		}
		ext := strings.ToLower(filepath.Ext(name))
		if ext != ".json" && ext != ".md" {
			continue
		}
		if prev, ok := byID[stem(name)]; !ok || formatOf(prev) == formatMarkdown {
			byID[stem(name)] = name // prefer .json when both exist
		}
	}
	files := make([]string, 0, len(byID))
	for _, f := range byID {
		files = append(files, f)
	}
	sort.Strings(files)
	return files
}

// hasSpec reports whether dir holds an agent spec with this id.
func hasSpec(dir, id string) bool {
	for _, f := range specFiles(dir) {
		if stem(f) == id {
			return true
		}
	}
	return false
}

// stem returns a file name without its extension.
func stem(name string) string { return strings.TrimSuffix(name, filepath.Ext(name)) }

// summarize builds a Summary from a parsed spec.
func summarize(id string, doc *document) Summary {
	sum := Summary{ID: id, Name: id, Format: string(doc.format)}
	if n := doc.fields.String("name"); n != "" {
		sum.Name = n
	}
	sum.Description = doc.fields.String("description")
	sum.Model = doc.fields.String("model")
	var tools []any
	if ok, err := doc.fields.Get("tools", &tools); ok && err == nil {
		sum.ToolCount = len(tools)
	}
	return sum
}
