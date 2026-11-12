package update

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"strconv"
	"strings"
	"time"
)

// DefaultSource is the public repository that publishes releases.
const DefaultSource = "https://github.com/kirodotdev-labs/config-control-kiro"

// Limits for what the updater downloads.
const (
	maxArchive = 150 << 20
	maxSig     = 4 << 10
)

// Asset is the release archive for an OS and architecture, as build-binaries.sh
// names them, or "" when there is no archive for it.
func Asset(goos, goarch string) string {
	switch goos + "/" + goarch {
	case "linux/amd64":
		return "cckiro-linux-amd64.tar.gz"
	case "darwin/amd64":
		return "cckiro-mac-intel.zip"
	case "darwin/arm64":
		return "cckiro-mac-arm.zip"
	case "windows/amd64":
		return "cckiro-windows-amd64.zip"
	}
	return ""
}

// source is where releases come from: GitHub's releases pages, which need no
// API token and have no API rate limit.
type source struct {
	base   string // https://github.com/<owner>/<repo>
	client *http.Client
	ua     string
}

func newSource(base, version string) (*source, error) {
	u, err := url.Parse(strings.TrimRight(base, "/"))
	if err != nil || u.Host == "" {
		return nil, fmt.Errorf("update source %q is not a URL", base)
	}
	if u.Scheme != "https" && !isLoopback(u.Hostname()) {
		return nil, errors.New("updates are only downloaded over HTTPS")
	}
	s := &source{base: u.String(), ua: "cckiro-updater/" + version}
	s.client = &http.Client{
		Timeout: 10 * time.Minute,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 10 {
				return errors.New("too many redirects")
			}
			if req.URL.Scheme != "https" && !isLoopback(req.URL.Hostname()) {
				return errors.New("an update download was redirected away from HTTPS")
			}
			return nil
		},
	}
	return s, nil
}

func isLoopback(host string) bool { return host == "127.0.0.1" || host == "localhost" || host == "::1" }

// downloadURL is the direct link to the newest release's archive for this system.
func (s *source) downloadURL(asset string) string {
	return s.base + "/releases/latest/download/" + asset
}

// releasesURL is the releases page.
func (s *source) releasesURL() string { return s.base + "/releases" }

// latest reads the newest release's version from where /releases/latest redirects.
func (s *source) latest() (string, error) {
	req, _ := http.NewRequest(http.MethodGet, s.base+"/releases/latest", nil)
	req.Header.Set("User-Agent", s.ua)
	c := *s.client
	c.Timeout = 20 * time.Second
	c.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	resp, err := c.Do(req)
	if err != nil {
		return "", fmt.Errorf("couldn't reach the releases page: %w", err)
	}
	defer resp.Body.Close()
	loc := resp.Header.Get("Location")
	if resp.StatusCode/100 != 3 || loc == "" {
		return "", fmt.Errorf("the releases page answered %d without a latest release", resp.StatusCode)
	}
	tag := path.Base(loc)
	v := strings.TrimPrefix(tag, "v")
	if !versionRe(v) {
		return "", fmt.Errorf("the latest release tag %q isn't a version", tag)
	}
	return v, nil
}

// fetch downloads one release file to dst (at most limit bytes) and returns its SHA-256.
func (s *source) fetch(version, name, dst string, limit int64) (string, error) {
	req, _ := http.NewRequest(http.MethodGet, s.base+"/releases/download/v"+version+"/"+name, nil)
	req.Header.Set("User-Agent", s.ua)
	resp, err := s.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("download of %s failed: %w", name, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("download of %s answered %d", name, resp.StatusCode)
	}
	f, err := os.OpenFile(dst, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	n, err := io.Copy(io.MultiWriter(f, h), io.LimitReader(resp.Body, limit+1))
	if err != nil {
		return "", fmt.Errorf("download of %s failed: %w", name, err)
	}
	if n > limit {
		return "", fmt.Errorf("%s is larger than expected", name)
	}
	return hex.EncodeToString(h.Sum(nil)), f.Close()
}

func versionRe(v string) bool {
	parts := strings.Split(v, ".")
	if len(parts) < 2 || len(parts) > 4 {
		return false
	}
	for _, p := range parts {
		if _, err := strconv.Atoi(p); err != nil {
			return false
		}
	}
	return true
}

// Newer reports whether candidate is a strictly higher dotted-numeric version
// than current. A "dev" build or an empty version never updates.
func Newer(candidate, current string) bool {
	if !versionRe(candidate) || !versionRe(current) {
		return false
	}
	c, u := strings.Split(candidate, "."), strings.Split(current, ".")
	for i := 0; i < max(len(c), len(u)); i++ {
		if a, b := part(c, i), part(u, i); a != b {
			return a > b
		}
	}
	return false
}

func part(p []string, i int) int {
	if i >= len(p) {
		return 0
	}
	n, _ := strconv.Atoi(p[i])
	return n
}
