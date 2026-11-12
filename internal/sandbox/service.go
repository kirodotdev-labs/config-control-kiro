// Package sandbox reads and writes the Kiro CLI V3 local command sandbox
// configuration (settings/sandbox.json) for the active scope.
package sandbox

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"runtime"

	"kiromanager/internal/shared/ordered"
	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

// Service reads and writes sandbox.json.
type Service struct {
	kiroService *system.KiroService
	logger      *utils.Logger
}

// NewService creates a sandbox Service.
func NewService(kiroService *system.KiroService, logger *utils.Logger) *Service {
	return &Service{kiroService: kiroService, logger: logger}
}

// Document is the editing view: the whole config (key order kept) plus metadata.
type Document struct {
	Config *ordered.Object `json:"config"`
	Path   string          `json:"path"`
	Exists bool            `json:"exists"`
	// Global is the Global policy when editing a Workspace: a Workspace can
	// only make an active Global policy stricter (kiro.dev/docs/sandbox).
	Global map[string]any `json:"global,omitempty"`
	// Platform says whether this computer can run the sandbox.
	Platform Platform `json:"platform"`
}

// Platform is what the sandbox needs on this OS and whether it's present.
type Platform struct {
	OS      string   `json:"os"`
	Ready   bool     `json:"ready"`
	Missing []string `json:"missing,omitempty"` // programs not on PATH
	Partial []string `json:"partial,omitempty"` // needed only by some network modes
	Note    string   `json:"note,omitempty"`
}

// lookPath finds programs on PATH; tests replace it.
var lookPath = exec.LookPath

// platformCheck reports the documented requirements: Bubblewrap (plus socat
// for the network modes that allow hosts) on Linux, the built-in Seatbelt on
// macOS, and a one-time /sandbox setup on Windows that can't be checked here.
func platformCheck(goos string) Platform {
	has := func(name string) bool { _, err := lookPath(name); return err == nil }
	p := Platform{OS: goos, Ready: true}
	switch goos {
	case "linux":
		if !has("bwrap") {
			p.Ready, p.Missing = false, []string{"bwrap"}
			p.Note = "Install Bubblewrap (bwrap) with your package manager, e.g. sudo apt install bubblewrap. Without it Kiro runs commands without isolation."
		}
		if !has("socat") {
			p.Partial = []string{"socat"}
		}
	case "darwin":
		if !has("sandbox-exec") {
			p.Ready, p.Missing = false, []string{"sandbox-exec"}
		}
	case "windows":
		p.Note = "Before COMMON_DEPENDENCIES or DEFAULT_ALLOWED can run commands, run /sandbox setup once in a Kiro CLI chat (it needs administrator rights). DEFAULT_BLOCKED works without it."
	}
	return p
}

// Get reads sandbox.json for the active scope.
func (s *Service) Get() (*Document, error) {
	path := s.kiroService.SandboxPath()
	doc := &Document{Config: ordered.New(), Path: path, Platform: platformCheck(runtime.GOOS)}
	if s.kiroService.GetMode() == system.ModeWorkspace {
		if data, err := os.ReadFile(s.kiroService.GlobalSandboxPath()); err == nil {
			var global map[string]any
			if json.Unmarshal(data, &global) == nil {
				doc.Global = global
			}
		}
	}
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return doc, nil
	}
	if err != nil {
		return nil, err
	}
	doc.Exists = true
	if len(bytes.TrimSpace(data)) == 0 {
		return doc, nil
	}
	if err := doc.Config.UnmarshalJSON(data); err != nil {
		return nil, utils.NewAppError("sandbox.json could not be parsed", http.StatusUnprocessableEntity, "SANDBOX_PARSE_ERROR")
	}
	return doc, nil
}

// Save writes the complete sandbox config. The UI sends the whole document,
// so preservation (including key order) is inherent.
func (s *Service) Save(config *ordered.Object) error {
	if config == nil {
		return utils.BadRequest("config is required", "INVALID_REQUEST")
	}
	out, err := config.Pretty()
	if err != nil {
		return err
	}
	return utils.WriteFileAtomic(s.kiroService.SandboxPath(), out)
}
