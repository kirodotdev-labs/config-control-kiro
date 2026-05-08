package changelog

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"os/exec"
	"regexp"
	"strings"
	"time"

	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

const (
	manifestURL = "https://prod.download.cli.kiro.dev/stable/latest/manifest.json"
	atomURL     = "https://kiro.dev/changelog/feed.atom"
)

// Entry represents a single changelog entry with version info and categorized changes.
type Entry struct {
	Version   string   `json:"version"`
	Date      string   `json:"date"`
	IsRelease bool     `json:"isRelease"`
	IsUpdate  bool     `json:"isUpdate"`
	Summary   string   `json:"summary,omitempty"`
	Link      string   `json:"link,omitempty"`
	Added     []string `json:"added"`
	Fixed     []string `json:"fixed"`
	Changed   []string `json:"changed"`
}

// Service retrieves and aggregates changelog information from the Kiro CLI
// and the remote Atom feed.
type Service struct {
	logger      *utils.Logger
	kiroService *system.KiroService
}

// NewService creates a new changelog Service.
func NewService(logger *utils.Logger, kiroService *system.KiroService) *Service {
	return &Service{logger: logger, kiroService: kiroService}
}

var versionRe = regexp.MustCompile(`^Version (\S+) \((\d{4}-\d{2}-\d{2})\)$`)

// GetChangelog returns the combined changelog from the local CLI and the remote
// Atom feed, along with the current and latest available versions.
func (s *Service) GetChangelog() (map[string]interface{}, error) {
	status, err := s.kiroService.GetKiroStatus()
	if err != nil {
		return nil, err
	}
	kiroPath, _ := status["kiroPath"].(string)
	if kiroPath == "" {
		return nil, fmt.Errorf("kiro-cli not found")
	}

	currentVersion, _ := status["version"].(string)
	currentVersion = strings.TrimPrefix(currentVersion, "kiro-cli ")

	// Get shell changelog (detailed, up to current version)
	// #nosec G204 - kiroPath from validated KiroService
	cmd := exec.Command(kiroPath, "version", "--changelog=all")
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to get changelog: %w", err)
	}
	entries := parseChangelog(string(out))

	// Get latest available version from manifest
	latestAvailable := fetchLatestVersion(s.logger)

	// Get Atom feed entries for CLI versions newer than current
	updateEntries := fetchAtomUpdates(s.logger, currentVersion)

	// Merge: update entries first, then shell entries
	allEntries := append(updateEntries, entries...)

	return map[string]interface{}{
		"current":         currentVersion,
		"latestAvailable": latestAvailable,
		"updateAvailable": latestAvailable != "" && currentVersion != "" && compareSemver(latestAvailable, currentVersion) > 0,
		"entries":         allEntries,
	}, nil
}

// parseChangelog parses the text output of "kiro version --changelog=all"
// into structured Entry values.
func parseChangelog(raw string) []Entry {
	var entries []Entry
	var current *Entry

	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		if m := versionRe.FindStringSubmatch(line); m != nil {
			if current != nil {
				entries = append(entries, *current)
			}
			current = &Entry{
				Version:   m[1],
				Date:      m[2],
				IsRelease: strings.HasSuffix(m[1], ".0"),
			}
			continue
		}

		if current == nil {
			continue
		}

		if strings.HasPrefix(line, "- Added:") {
			current.Added = append(current.Added, strings.TrimPrefix(line, "- Added: "))
		} else if strings.HasPrefix(line, "- Fixed:") {
			current.Fixed = append(current.Fixed, strings.TrimPrefix(line, "- Fixed: "))
		} else if strings.HasPrefix(line, "- Changed:") {
			current.Changed = append(current.Changed, strings.TrimPrefix(line, "- Changed: "))
		} else if strings.HasPrefix(line, "- deprecated:") {
			current.Changed = append(current.Changed, strings.TrimPrefix(line, "- deprecated: "))
		} else if strings.HasPrefix(line, "- security:") {
			current.Fixed = append(current.Fixed, strings.TrimPrefix(line, "- security: "))
		}
	}
	if current != nil {
		entries = append(entries, *current)
	}
	return entries
}

// fetchLatestVersion gets the latest version from the Kiro CLI manifest.
func fetchLatestVersion(logger *utils.Logger) string {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(manifestURL)
	if err != nil {
		logger.Warn("Failed to fetch manifest: %v", err)
		return ""
	}
	defer resp.Body.Close()

	var manifest struct {
		Version string `json:"version"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&manifest); err != nil {
		logger.Warn("Failed to parse manifest: %v", err)
		return ""
	}
	return manifest.Version
}

// atomFeed represents the top-level Atom feed structure.
type atomFeed struct {
	Entries []atomEntry `xml:"entry"`
}

// atomEntry represents a single entry in the Atom feed.
type atomEntry struct {
	Title     string       `xml:"title"`
	Link      atomLink     `xml:"link"`
	Published string       `xml:"published"`
	Category  atomCategory `xml:"category"`
	Summary   string       `xml:"summary"`
}

// atomLink represents a link element in an Atom entry.
type atomLink struct {
	Href string `xml:"href,attr"`
}

// atomCategory represents a category element in an Atom entry.
type atomCategory struct {
	Term string `xml:"term,attr"`
}

var cliVersionFromURL = regexp.MustCompile(`/cli/(\d+)-(\d+)$`)

// fetchAtomUpdates gets CLI entries from the Atom feed newer than the current version.
func fetchAtomUpdates(logger *utils.Logger, currentVersion string) []Entry {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(atomURL)
	if err != nil {
		logger.Warn("Failed to fetch Atom feed: %v", err)
		return nil
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		logger.Warn("Failed to read Atom feed: %v", err)
		return nil
	}

	var feed atomFeed
	if err := xml.Unmarshal(body, &feed); err != nil {
		logger.Warn("Failed to parse Atom feed: %v", err)
		return nil
	}

	currentMajorMinor := majorMinor(currentVersion)
	var entries []Entry

	for _, e := range feed.Entries {
		if e.Category.Term != "CLI" {
			continue
		}

		// Extract version from URL like /changelog/cli/1-28
		m := cliVersionFromURL.FindStringSubmatch(e.Link.Href)
		if m == nil {
			continue
		}
		feedVersion := m[1] + "." + m[2] + ".0"

		if compareSemver(feedVersion, currentMajorMinor+".0") <= 0 {
			continue
		}

		date := ""
		if len(e.Published) >= 10 {
			date = e.Published[:10]
		}

		// Clean up summary - strip HTML tags
		summary := stripHTML(e.Summary)
		if len(summary) > 300 {
			summary = summary[:300] + "..."
		}

		entries = append(entries, Entry{
			Version:   m[1] + "." + m[2],
			Date:      date,
			IsRelease: true,
			IsUpdate:  true,
			Summary:   summary,
			Link:      e.Link.Href,
		})
	}

	return entries
}

// majorMinor extracts the "major.minor" prefix from a semver string.
func majorMinor(version string) string {
	parts := strings.Split(version, ".")
	if len(parts) >= 2 {
		return parts[0] + "." + parts[1]
	}
	return version
}

// compareSemver compares two semver strings and returns a negative value if a < b,
// zero if a == b, or a positive value if a > b.
func compareSemver(a, b string) int {
	pa := strings.Split(a, ".")
	pb := strings.Split(b, ".")
	for i := 0; i < 3; i++ {
		var va, vb int
		if i < len(pa) {
			fmt.Sscanf(pa[i], "%d", &va)
		}
		if i < len(pb) {
			fmt.Sscanf(pb[i], "%d", &vb)
		}
		if va != vb {
			return va - vb
		}
	}
	return 0
}

// stripHTML removes HTML tags from a string and trims whitespace.
func stripHTML(s string) string {
	var result strings.Builder
	inTag := false
	for _, r := range s {
		if r == '<' {
			inTag = true
		} else if r == '>' {
			inTag = false
		} else if !inTag {
			result.WriteRune(r)
		}
	}
	return strings.TrimSpace(result.String())
}

// Handler provides HTTP handlers for changelog endpoints.
type Handler struct {
	service *Service
}

// NewHandler creates a new Handler backed by the given changelog Service.
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// GetChangelog handles GET requests to retrieve the full changelog.
func (h *Handler) GetChangelog(w http.ResponseWriter, r *http.Request) {
	result, err := h.service.GetChangelog()
	if err != nil {
		utils.RespondError(w, err)
		return
	}
	utils.RespondJSON(w, http.StatusOK, result)
}
