package kirocli

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
)

// liveCatalog is the shape of Kiro's published catalog (checked against
// prod.download.desktop.kiro.dev/powers/default_registry.json, November 2026).
const liveCatalog = `{"schemaVersion":"1.0.0","powers":[
 {"name":"visily","displayName":"Visily","author":"Visily","description":"Design UI","repositoryUrl":"https://github.com/kirodotdev/powers/tree/main/visily","category":"Design","iconUrl":"x","launchUrl":"kiro://kiro.powers/add?name=visily"},
 {"name":"figma","displayName":"Figma","description":"d","repositoryUrl":"https://github.com/kirodotdev/powers/tree/main/figma"}]}`

func savedPowers(t *testing.T) string {
	t.Helper()
	home := t.TempDir()
	dir := filepath.Join(home, "powers")
	_ = os.MkdirAll(dir, 0o755)
	_ = os.WriteFile(filepath.Join(dir, "registry.json"), []byte(`{"lastUpdated":"2026-02-22T18:49:51.449Z","powers":{"figma":{"name":"figma"}}}`), 0o644)
	_ = os.WriteFile(filepath.Join(dir, "installed.json"), []byte(`{"version":"1.0.0","installedPowers":[{"name":"figma"},{"name":"local-tool"}],"dismissedAutoInstalls":[]}`), 0o644)
	return home
}

func TestPowerListLive(t *testing.T) {
	var gets, notModified atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gets.Add(1)
		if r.Header.Get("If-None-Match") == `"v1"` {
			notModified.Add(1)
			w.WriteHeader(http.StatusNotModified)
			return
		}
		w.Header().Set("ETag", `"v1"`)
		w.Header().Set("Last-Modified", "Thu, 05 Nov 2026 09:45:29 GMT")
		_, _ = w.Write([]byte(liveCatalog))
	}))
	defer srv.Close()
	s := &Service{catalog: catalogCache{url: srv.URL}}
	home := savedPowers(t)

	got := s.PowerList(home, false)
	if got.CatalogSource != "live" || got.CatalogUpdated != "Thu, 05 Nov 2026 09:45:29 GMT" || got.CatalogProblem != "" || len(got.Catalog) != 2 {
		t.Fatalf("live catalog: %+v", got)
	}
	if got.Catalog[1].Name != "visily" || got.Catalog[1].Category != "Design" || got.Catalog[1].Installed {
		t.Errorf("a power only in the live catalog: %+v", got.Catalog[1])
	}
	if len(got.Installed) != 2 || got.Installed[0].Name != "figma" || got.Installed[1].Name != "local-tool" {
		t.Errorf("installed from installed.json, a folder install kept: %+v", got.Installed)
	}
	s.PowerList(home, false)
	if gets.Load() != 1 {
		t.Errorf("cached for an hour: %d downloads", gets.Load())
	}
	if again := s.PowerList(home, true); notModified.Load() != 1 || len(again.Catalog) != 2 {
		t.Errorf("refresh asks with the ETag and keeps the copy when unchanged: %d %+v", notModified.Load(), again)
	}
}

func TestPowerListFallsBack(t *testing.T) {
	home := savedPowers(t)
	down := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusBadGateway) }))
	defer down.Close()
	got := (&Service{catalog: catalogCache{url: down.URL}}).PowerList(home, false)
	if got.CatalogSource != "saved" || got.CatalogUpdated != "2026-02-22T18:49:51.449Z" || !strings.Contains(got.CatalogProblem, "502") || len(got.Catalog) != 1 {
		t.Errorf("unreachable: Kiro's saved catalog, with the reason: %+v", got)
	}
	bad := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(`{"items":[]}`)) }))
	defer bad.Close()
	if got := (&Service{catalog: catalogCache{url: bad.URL}}).PowerList(home, false); got.CatalogSource != "saved" || !strings.Contains(got.CatalogProblem, "shape") {
		t.Errorf("an unknown shape falls back: %+v", got)
	}
	if got := (&Service{}).PowerList(home, false); got.CatalogSource != "saved" || got.CatalogProblem != "" {
		t.Errorf("no live catalog configured: %+v", got)
	}
}

func TestPowersCatalogURL(t *testing.T) {
	t.Setenv(CatalogEnv, "")
	if powersCatalogURL() != kiroPowersCatalog {
		t.Error("Kiro's catalog by default")
	}
	t.Setenv(CatalogEnv, "http://127.0.0.1:1/c.json")
	if powersCatalogURL() != "http://127.0.0.1:1/c.json" {
		t.Error("overridable for tests")
	}
}
