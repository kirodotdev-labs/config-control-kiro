// Package workflows reads Kiro CLI V3's workflow runs, read only. Kiro keeps
// each run in <Kiro home>/sessions/<folder key>/workflows/<workflow id>/:
// workflow-definition.json (the recipe that ran), workflow-state.json (status,
// inputs, artifacts, captured outputs and the node tree with each node's
// status) and sessions.json (which session each step ran in). The app never
// writes these files; pausing or resuming a run happens in the Kiro process
// that owns it.
package workflows

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

// idRule is the shape of a workflow id; anything else is refused before it reaches the disk.
var idRule = regexp.MustCompile(`^wf_[A-Za-z0-9]+$`)

// chatRule is the shape of a V3 chat id, safe to put on a command line.
var chatRule = regexp.MustCompile(`^sess_[A-Za-z0-9-]+$`)

// Service lists and reads workflow runs for the active scope.
type Service struct{ kiro *system.KiroService }

// NewService creates a workflows Service.
func NewService(kiro *system.KiroService) *Service { return &Service{kiro: kiro} }

// Node is one node of a run, as Kiro records it. Status is pending,
// running, paused, completed, failed, aborted or skipped. A repeat's children
// carry the iteration they ran in; a parallel's carry their branch.
type Node struct {
	NodeID         string            `json:"nodeId"`
	Type           string            `json:"type"`
	Status         string            `json:"status"`
	AgentName      string            `json:"agentName,omitempty"`
	ModelID        string            `json:"modelId,omitempty"`
	EffortLevel    string            `json:"effortLevel,omitempty"`
	StartedAt      string            `json:"startedAt,omitempty"`
	EndedAt        string            `json:"endedAt,omitempty"`
	SessionID      string            `json:"sessionId,omitempty"`
	Signal         string            `json:"completionSignal,omitempty"`
	CapturedOutput string            `json:"capturedOutput,omitempty"`
	Artifacts      map[string]string `json:"artifacts,omitempty"`
	FailureReason  string            `json:"failureReason,omitempty"`
	AwaitingInput  bool              `json:"awaitingUserInput,omitempty"`
	Iteration      *int              `json:"iteration,omitempty"`
	BranchID       string            `json:"branchId,omitempty"`
	Children       []Node            `json:"children,omitempty"`
}

// Run is a run's summary, for lists.
type Run struct {
	ID          string `json:"id"`
	Name        string `json:"name"`  // the recipe name
	Label       string `json:"label"` // the run's own label
	Status      string `json:"status"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
	Workspace   string `json:"workspace"`
	ParentChat  string `json:"parentChat"`
	Resume      string `json:"resumeCommand,omitempty"` // reopens the parent chat, run in Workspace
	Steps       int    `json:"steps"`
	StepsDone   int    `json:"stepsDone"`
	CurrentNode string `json:"currentNode,omitempty"`
}

// Detail is one run in full.
type Detail struct {
	Run
	Inputs     map[string]string `json:"inputs"`
	Artifacts  map[string]string `json:"artifacts"`
	Outputs    map[string]string `json:"outputs"`
	Root       Node              `json:"root"`
	Definition json.RawMessage   `json:"definition,omitempty"`
	Request    []string          `json:"request,omitempty"` // what was asked in the parent chat
	Dir        string            `json:"dir"`
}

// state is the part of workflow-state.json the app reads.
type state struct {
	WorkflowID   string            `json:"workflowId"`
	WorkflowName string            `json:"workflowName"`
	RunLabel     string            `json:"runLabel"`
	Status       string            `json:"status"`
	CreatedAt    string            `json:"createdAt"`
	Inputs       map[string]string `json:"inputs"`
	Artifacts    map[string]string `json:"artifacts"`
	Outputs      map[string]string `json:"capturedOutputs"`
	Root         Node              `json:"root"`
	Parent       string            `json:"parentSessionId"`
	Workspace    string            `json:"workspacePath"`
	Request      []string          `json:"originalUserMessages"`
}

// List returns the runs of the active scope, newest first: every run in
// Global, only runs in the active Workspace's folder (or below it) in a Workspace.
func (s *Service) List() []Run {
	out := []Run{}
	for _, dir := range s.runDirs() {
		st, mod, ok := readState(dir)
		if ok && s.inScope(st.Workspace) {
			out = append(out, summary(st, mod))
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt > out[j].CreatedAt })
	return out
}

// Get returns one run in full.
func (s *Service) Get(id string) (*Detail, error) {
	if !idRule.MatchString(id) {
		return nil, utils.BadRequest("Not a workflow id", "INVALID_ID")
	}
	for _, dir := range s.runDirs() {
		if filepath.Base(dir) != id {
			continue
		}
		st, mod, ok := readState(dir)
		if !ok {
			break
		}
		d := &Detail{Run: summary(st, mod), Inputs: st.Inputs, Artifacts: st.Artifacts, Outputs: st.Outputs, Root: st.Root, Request: st.Request, Dir: dir}
		if def, err := os.ReadFile(filepath.Join(dir, "workflow-definition.json")); err == nil && json.Valid(def) {
			d.Definition = def
		}
		return d, nil
	}
	return nil, utils.NewAppError("No workflow run with that id.", http.StatusNotFound, "RUN_NOT_FOUND")
}

// runDirs lists every <home>/sessions/*/workflows/wf_* folder.
func (s *Service) runDirs() []string {
	dirs, _ := filepath.Glob(filepath.Join(s.kiro.GlobalConfigPath(), "sessions", "*", "workflows", "wf_*"))
	return dirs
}

// inScope reports whether a run in workspace belongs to the active scope.
func (s *Service) inScope(workspace string) bool {
	if s.kiro.GetMode() != system.ModeWorkspace {
		return true
	}
	root := filepath.Clean(s.kiro.GetActiveWorkspace())
	rel, err := filepath.Rel(root, filepath.Clean(workspace))
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func readState(dir string) (state, time.Time, bool) {
	path := filepath.Join(dir, "workflow-state.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return state{}, time.Time{}, false
	}
	var st state
	if json.Unmarshal(data, &st) != nil || st.WorkflowID == "" {
		return state{}, time.Time{}, false
	}
	info, _ := os.Stat(path)
	return st, info.ModTime(), true
}

func summary(st state, mod time.Time) Run {
	r := Run{ID: st.WorkflowID, Name: st.WorkflowName, Label: st.RunLabel, Status: st.Status, CreatedAt: st.CreatedAt,
		UpdatedAt: mod.UTC().Format(time.RFC3339), Workspace: st.Workspace, ParentChat: st.Parent}
	if chatRule.MatchString(st.Parent) {
		r.Resume = "kiro-cli chat --v3 --resume-id " + st.Parent
	}
	var walk func(n Node)
	walk = func(n Node) {
		if n.Type == "step" {
			r.Steps++
			if n.Status == "completed" {
				r.StepsDone++
			}
			if n.Status == "running" && r.CurrentNode == "" {
				r.CurrentNode = n.NodeID
			}
		}
		for _, c := range n.Children {
			walk(c)
		}
	}
	walk(st.Root)
	return r
}
