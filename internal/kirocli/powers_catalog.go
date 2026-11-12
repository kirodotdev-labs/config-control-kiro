package kirocli

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// kiroPowersCatalog is the catalog Kiro itself downloads into
// <kiroHome>/powers/registry.json (its kiroRecommendedRepo url).
// CatalogEnv points at another one, for tests.
const (
	kiroPowersCatalog = "https://prod.download.desktop.kiro.dev/powers/default_registry.json"
	CatalogEnv        = "CCKIRO_POWERS_CATALOG"
)

// powersCatalogURL is CatalogEnv when set, else Kiro's catalog.
func powersCatalogURL() string {
	if u := strings.TrimSpace(os.Getenv(CatalogEnv)); u != "" {
		return u
	}
	return kiroPowersCatalog
}

const (
	catalogTTL     = time.Hour
	catalogTimeout = 15 * time.Second
	catalogMaxSize = 8 << 20 // the catalog is about 160 KB
)

// livePower is one entry of Kiro's published catalog: {schemaVersion, powers: [...]}.
type livePower struct {
	Name          string `json:"name"`
	DisplayName   string `json:"displayName"`
	Description   string `json:"description"`
	Author        string `json:"author"`
	RepositoryURL string `json:"repositoryUrl"`
	Category      string `json:"category"`
	Tier          string `json:"publisherTier"`
	AuthType      string `json:"authType"`
}

// catalogCache keeps the last download of Kiro's catalog for catalogTTL and
// asks again with its ETag, so an unchanged catalog isn't downloaded twice.
type catalogCache struct {
	mu       sync.Mutex
	url      string
	client   *http.Client
	powers   []livePower
	etag     string
	modified string // the catalog's Last-Modified, as Kiro's server reports it
	fetched  time.Time
}

// get returns the live catalog and when Kiro last changed it, downloading it
// when stale or on refresh. err says why it couldn't be downloaded; a copy
// from an earlier download is still returned with it.
func (c *catalogCache) get(refresh bool) ([]livePower, string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.url == "" {
		return nil, "", nil // no live catalog configured: Kiro's saved copy is used
	}
	if c.powers != nil && !refresh && time.Since(c.fetched) < catalogTTL {
		return c.powers, c.modified, nil
	}
	err := c.download()
	return c.powers, c.modified, err
}

func (c *catalogCache) download() error {
	ctx, cancel := context.WithTimeout(context.Background(), catalogTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.url, nil)
	if err != nil {
		return err
	}
	if c.etag != "" && c.powers != nil {
		req.Header.Set("If-None-Match", c.etag)
	}
	client := c.client
	if client == nil {
		client = http.DefaultClient
	}
	res, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("couldn't reach Kiro's catalog: %w", err)
	}
	defer res.Body.Close()
	switch {
	case res.StatusCode == http.StatusNotModified:
		c.fetched = time.Now()
		return nil
	case res.StatusCode != http.StatusOK:
		return fmt.Errorf("the catalog server answered %s", res.Status)
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, catalogMaxSize+1))
	if err != nil {
		return fmt.Errorf("couldn't read Kiro's catalog: %w", err)
	}
	if len(data) > catalogMaxSize {
		return fmt.Errorf("the catalog is larger than expected")
	}
	var doc struct {
		Powers []livePower `json:"powers"`
	}
	if err := json.Unmarshal(data, &doc); err != nil || doc.Powers == nil {
		return fmt.Errorf("the catalog isn't in a shape this app knows; update Config Control for Kiro")
	}
	c.powers, c.etag, c.modified, c.fetched = doc.Powers, res.Header.Get("ETag"), res.Header.Get("Last-Modified"), time.Now()
	return nil
}
