package memory

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"kiromanager/internal/kirocli"
	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

// Kiro's limits for a memory (its memory tool and controller): a dash-slug
// title of at most 50 characters and a one-line summary of at most 200.
const (
	maxTitle   = 50
	maxSummary = 200
	callWait   = 45 * time.Second // starting kiro-cli acp and opening the store
)

var (
	titleRe = regexp.MustCompile(`^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$`)
	// scopeRe is the scope tags Kiro accepts: Global, workspace:<name>, repo:<provider>/<owner>/<name>.
	scopeRe = regexp.MustCompile(`^(Global|workspace:[^\s]+|repo:[^/\s]+/[^/\s]+/[^/\s]+)$`)
	types   = map[string]bool{"USER_PREFERENCE": true, "SEMANTIC": true}
)

// Draft is a memory to create, or the fields to change in one.
type Draft struct {
	Type    string `json:"type"`  // USER_PREFERENCE or SEMANTIC
	Scope   string `json:"scope"` // create only: Global or a repository tag
	Title   string `json:"title"`
	Summary string `json:"summary"`
	Content string `json:"content"`
}

// Editor changes memories through Kiro itself (its _kiro/memory ACP methods),
// so Kiro validates, writes and syncs them; the app never writes the database.
type Editor struct {
	kiro *system.KiroService
	cli  *kirocli.Runner
}

// NewEditor creates an Editor that runs the installed kiro-cli.
func NewEditor(kiro *system.KiroService, cli *kirocli.Runner) *Editor {
	return &Editor{kiro: kiro, cli: cli}
}

func (d Draft) check(create bool) error {
	bad := func(msg string) error { return utils.BadRequest(msg, "INVALID_MEMORY") }
	if !types[d.Type] {
		return bad("Choose a type: preference (how you like Kiro to work) or fact (something true to remember).")
	}
	if create && !scopeRe.MatchString(d.Scope) {
		return bad("Choose where it applies: Global or a repository.")
	}
	if !titleRe.MatchString(d.Title) || utf8.RuneCountInString(d.Title) > maxTitle {
		return bad("The title is a short dash-slug: letters, digits and hyphens, at most 50 characters (e.g. seed-db-before-tests).")
	}
	if strings.TrimSpace(d.Summary) == "" || strings.Contains(d.Summary, "\n") || utf8.RuneCountInString(d.Summary) > maxSummary {
		return bad("The description is one line of at most 200 characters: what it covers and when to use it.")
	}
	if strings.TrimSpace(d.Content) == "" {
		return bad("Write the memory's content.")
	}
	return nil
}

// dir is where kiro-cli acp starts: the active Workspace, or the Kiro home's parent.
func (e *Editor) dir() string {
	if e.kiro.GetMode() == system.ModeWorkspace {
		return e.kiro.GetActiveWorkspace()
	}
	return utils.ExpandHomePath("~")
}

func (e *Editor) call(method string, params map[string]any) error {
	_, err := e.cli.CallACP(context.Background(), callWait, e.dir(), method, params)
	var kiro *kirocli.ACPError
	if errors.As(err, &kiro) {
		return utils.NewAppError("Kiro refused: "+kiro.Message, http.StatusConflict, "KIRO_REFUSED")
	}
	var p *kirocli.Problem
	if errors.As(err, &p) {
		return p.AppError()
	}
	if err != nil {
		return utils.NewAppError(err.Error(), http.StatusBadGateway, "KIRO_FAILED")
	}
	return nil
}

// Create adds a memory, as if Kiro had saved it (it is marked as made by hand).
func (e *Editor) Create(d Draft) error {
	if err := d.check(true); err != nil {
		return err
	}
	return e.call("_kiro/memory/create", map[string]any{
		"memoryType": d.Type, "scopes": []string{d.Scope}, "title": d.Title, "summary": strings.TrimSpace(d.Summary), "content": d.Content,
	})
}

// Update changes a memory's type, title, summary and content. Kiro can't move
// a memory to another scope.
func (e *Editor) Update(id string, d Draft) error {
	if strings.TrimSpace(id) == "" {
		return utils.BadRequest("Which memory?", "MISSING_ID")
	}
	if err := d.check(false); err != nil {
		return err
	}
	return e.call("_kiro/memory/update", map[string]any{
		"id": id, "memoryType": d.Type, "newTitle": d.Title, "summary": strings.TrimSpace(d.Summary), "content": d.Content,
	})
}

// Delete removes a memory.
func (e *Editor) Delete(id string) error {
	if strings.TrimSpace(id) == "" {
		return utils.BadRequest("Which memory?", "MISSING_ID")
	}
	return e.call("_kiro/memory/delete", map[string]any{"id": id})
}
