package kirocli

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"time"

	"kiromanager/internal/shared/utils"
)

// Power is one entry of Kiro's powers catalog, or an installed power.
type Power struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName,omitempty"`
	Description string `json:"description,omitempty"`
	Author      string `json:"author,omitempty"`
	Repository  string `json:"repository,omitempty"`
	Category    string `json:"category,omitempty"`
	Tier        string `json:"tier,omitempty"`     // Official or Community
	AuthType    string `json:"authType,omitempty"` // what signing in to its service needs: none, oauth, apiKey, …
	Installed   bool   `json:"installed"`
}

// PowerList is what Kiro has installed and what its catalog offers.
type PowerList struct {
	Installed []Power `json:"installed"`
	Catalog   []Power `json:"catalog"`
	// Unreadable names a Kiro file that exists but isn't in the shape this app
	// knows (Kiro may have changed it); the lists may then be incomplete.
	Unreadable string `json:"unreadable,omitempty"`
	// CatalogSource is "live" (Kiro's published catalog, downloaded by this
	// app) or "saved" (Kiro's own copy, registry.json). CatalogUpdated is when
	// that catalog last changed, and CatalogProblem why the live one couldn't
	// be downloaded.
	CatalogSource  string `json:"catalogSource"`
	CatalogUpdated string `json:"catalogUpdated,omitempty"`
	CatalogProblem string `json:"catalogProblem,omitempty"`
}

const powersTimeout = 3 * time.Minute

// powerName matches a catalog name; anything else must be an existing folder.
var powerName = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]*$`)

// PowerList is what is installed (Kiro's installed.json, read fresh on every
// call; kiro-cli has no command that lists powers) and Kiro's catalog: the
// published one, downloaded at most hourly (or on refresh), else Kiro's own
// saved copy, registry.json. Installing still goes through kiro-cli.
func (s *Service) PowerList(kiroHome string, refresh bool) PowerList {
	saved := Powers(kiroHome)
	live, modified, err := s.catalog.get(refresh)
	if live == nil {
		if err != nil {
			saved.CatalogProblem = err.Error()
		}
		return saved
	}
	installed := map[string]bool{}
	for _, p := range saved.Installed {
		installed[p.Name] = true
	}
	out := PowerList{Installed: []Power{}, Catalog: []Power{}, Unreadable: saved.Unreadable, CatalogSource: "live", CatalogUpdated: modified}
	if err != nil {
		out.CatalogProblem = err.Error() // an earlier download is shown
	}
	for _, p := range live {
		pw := Power{Name: p.Name, DisplayName: p.DisplayName, Description: p.Description, Author: p.Author,
			Repository: p.RepositoryURL, Category: p.Category, Tier: p.Tier, AuthType: p.AuthType, Installed: installed[p.Name]}
		out.Catalog = append(out.Catalog, pw)
		if pw.Installed {
			out.Installed = append(out.Installed, pw)
			delete(installed, p.Name)
		}
	}
	for _, p := range saved.Installed { // installed from a folder, or no longer published
		if installed[p.Name] {
			out.Installed = append(out.Installed, p)
		}
	}
	sortPowers(out.Catalog)
	sortPowers(out.Installed)
	return out
}

func sortPowers(s []Power) { sort.Slice(s, func(i, j int) bool { return s[i].Name < s[j].Name }) }

// Powers reads Kiro's own files under <kiroHome>/powers, fresh on every call:
// installed.json (what is installed) and registry.json (Kiro's saved copy of
// its catalog). A file in an unknown shape is reported.
func Powers(kiroHome string) PowerList {
	out := PowerList{Installed: []Power{}, Catalog: []Power{}, CatalogSource: "saved"}
	dir := filepath.Join(kiroHome, "powers")
	var reg struct {
		LastUpdated string `json:"lastUpdated"`
		Powers      map[string]struct {
			Name          string `json:"name"`
			DisplayName   string `json:"displayName"`
			Description   string `json:"description"`
			Author        string `json:"author"`
			RepositoryURL string `json:"repositoryUrl"`
			Installed     bool   `json:"installed"`
		} `json:"powers"`
	}
	if data, err := os.ReadFile(filepath.Join(dir, "registry.json")); err == nil && json.Unmarshal(data, &reg) != nil {
		out.Unreadable = "registry.json"
	}
	out.CatalogUpdated = reg.LastUpdated
	installed := map[string]bool{}
	var inst struct {
		InstalledPowers []json.RawMessage `json:"installedPowers"`
	}
	if data, err := os.ReadFile(filepath.Join(dir, "installed.json")); err == nil && json.Unmarshal(data, &inst) != nil {
		out.Unreadable = "installed.json"
	}
	for _, raw := range inst.InstalledPowers {
		var name string
		if json.Unmarshal(raw, &name) != nil {
			var obj struct {
				Name string `json:"name"`
			}
			_ = json.Unmarshal(raw, &obj)
			name = obj.Name
		}
		if name != "" {
			installed[name] = true
		}
	}
	for key, p := range reg.Powers {
		name := p.Name
		if name == "" {
			name = key
		}
		pw := Power{Name: name, DisplayName: p.DisplayName, Description: p.Description, Author: p.Author,
			Repository: p.RepositoryURL, Installed: installed[name] || p.Installed}
		out.Catalog = append(out.Catalog, pw)
		if pw.Installed {
			out.Installed = append(out.Installed, pw)
			delete(installed, name)
		}
	}
	for name := range installed { // installed from a folder, not in the catalog
		out.Installed = append(out.Installed, Power{Name: name, Installed: true})
	}
	sortPowers(out.Catalog)
	sortPowers(out.Installed)
	return out
}

// InstallPower runs `kiro-cli powers install <name|folder>`. A catalog name or
// an existing folder (with plugin.json or POWER.md) is accepted.
func (s *Service) InstallPower(target string) (string, error) {
	if !powerName.MatchString(target) {
		if err := utils.ValidatePath(target); err != nil {
			return "", err
		}
		info, err := os.Stat(target)
		if err != nil || !info.IsDir() {
			return "", utils.BadRequest("Enter a power's catalog name, or choose the folder that contains it.", "INVALID_POWER")
		}
		if !hasManifest(target) {
			return "", utils.BadRequest("That folder has no plugin.json or POWER.md, so it isn't a power.", "INVALID_POWER")
		}
	}
	return s.runPowers("install", target)
}

// UninstallPower runs `kiro-cli powers uninstall <name>`.
func (s *Service) UninstallPower(name string) (string, error) {
	if !powerName.MatchString(name) {
		return "", utils.BadRequest("That isn't a valid power name.", "INVALID_POWER")
	}
	return s.runPowers("uninstall", name)
}

func (s *Service) runPowers(action, arg string) (string, error) {
	res, p := s.Runner.Run(context.Background(), powersTimeout, "powers", action, arg)
	if p != nil {
		return "", p.AppError()
	}
	s.mu.Lock()
	s.status = nil // installed powers can change what Kiro loads; re-check on next request
	s.mu.Unlock()
	return string(res.Stdout), nil
}

func hasManifest(dir string) bool {
	for _, f := range []string{"plugin.json", "POWER.md"} {
		if _, err := os.Stat(filepath.Join(dir, f)); err == nil {
			return true
		}
	}
	return false
}

// PowersHandler exposes powers over HTTP.
type PowersHandler struct {
	service  *Service
	kiroHome func() string
}

// NewPowersHandler creates a PowersHandler; kiroHome returns the global Kiro home.
func NewPowersHandler(service *Service, kiroHome func() string) *PowersHandler {
	return &PowersHandler{service: service, kiroHome: kiroHome}
}

// List handles GET /powers (?refresh=1 downloads Kiro's catalog again now).
func (h *PowersHandler) List(w http.ResponseWriter, r *http.Request) {
	utils.RespondJSON(w, http.StatusOK, h.service.PowerList(h.kiroHome(), r.URL.Query().Get("refresh") == "1"))
}

// Install handles POST /powers/install with {target}.
func (h *PowersHandler) Install(w http.ResponseWriter, r *http.Request) {
	h.change(w, r, h.service.InstallPower)
}

// Installed handles GET /powers/installed/{name}: what is inside an installed power.
func (h *PowersHandler) Installed(w http.ResponseWriter, r *http.Request) {
	d, err := InstalledPower(h.kiroHome(), r.PathValue("name"))
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, d)
}

// Sources handles GET /powers/sources: the power folders you keep in Kiro's power-sources.
func (h *PowersHandler) Sources(w http.ResponseWriter, r *http.Request) {
	utils.RespondJSON(w, http.StatusOK, map[string]any{"dir": SourcesDir(h.kiroHome()), "powers": PowerSources(h.kiroHome())})
}

// Source handles GET /powers/source?path=: a power folder you keep yourself.
func (h *PowersHandler) Source(w http.ResponseWriter, r *http.Request) {
	d, err := PowerSource(r.URL.Query().Get("path"))
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, d)
}

// InstallGitHub handles POST /powers/install-github with {target}: a GitHub folder URL.
func (h *PowersHandler) InstallGitHub(w http.ResponseWriter, r *http.Request) {
	h.change(w, r, h.service.InstallFromGitHub)
}

// Uninstall handles POST /powers/uninstall with {target}.
func (h *PowersHandler) Uninstall(w http.ResponseWriter, r *http.Request) {
	h.change(w, r, h.service.UninstallPower)
}

func (h *PowersHandler) change(w http.ResponseWriter, r *http.Request, fn func(string) (string, error)) {
	var req struct {
		Target string `json:"target"`
	}
	if !utils.DecodeJSON(w, r, &req) {
		return
	}
	out, err := fn(req.Target)
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, map[string]any{"output": out, "powers": h.service.PowerList(h.kiroHome(), false)})
}
