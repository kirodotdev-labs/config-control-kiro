package agent

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeTree(t *testing.T, dir string, files ...string) {
	t.Helper()
	for _, f := range files {
		p := filepath.Join(dir, filepath.FromSlash(f))
		_ = os.MkdirAll(filepath.Dir(p), 0o755)
		if err := os.WriteFile(p, []byte("12345"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

func TestEstimateFolder(t *testing.T) {
	dir := t.TempDir()
	writeTree(t, dir, "a.md", "guide/b.md", "guide/c.txt", "node_modules/x/d.md", ".git/e.md", "src/f.go")
	cases := []struct {
		include, exclude []string
		want             int
	}{
		{nil, nil, 5},
		{[]string{"**/*.md"}, nil, 3},
		{[]string{"*.md"}, nil, 3},
		{[]string{"**/*.md"}, []string{"node_modules/**"}, 2},
		{[]string{"**/*.md"}, []string{"node_modules/"}, 2},
		{[]string{"**/*.md"}, []string{"node_modules"}, 2},
		{[]string{"guide/*"}, nil, 2},
		{nil, []string{"*.txt", "src/**"}, 3},
		{[]string{"", "  "}, nil, 5},
	}
	for _, c := range cases {
		est, err := EstimateFolder(dir, c.include, c.exclude)
		if err != nil || est.Files != c.want || est.Truncated || est.Missing {
			t.Errorf("include %q exclude %q: %+v %v, want %d", c.include, c.exclude, est, err, c.want)
		}
	}
	if est, _ := EstimateFolder(dir, nil, nil); est.Bytes != 25 {
		t.Errorf("bytes: %d", est.Bytes)
	}
	if est, err := EstimateFolder(filepath.Join(dir, "missing"), nil, nil); err != nil || !est.Missing {
		t.Errorf("a missing folder is an answer, not an error: %+v %v", est, err)
	}
	if _, err := EstimateFolder(dir+"/../x", nil, nil); err == nil {
		t.Error("path traversal is refused")
	}
}

func TestEstimateKnowledgeHandler(t *testing.T) {
	svc, _ := newTestService(t)
	h := NewHandler(svc)
	dir := t.TempDir()
	writeTree(t, dir, "a.md", "b.txt")
	body, _ := json.Marshal(map[string]any{"folder": dir, "include": []string{"*.md"}})
	if w := request(h.EstimateKnowledge, "POST", "/api/knowledge/estimate", "", string(body)); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"files":1`) {
		t.Errorf("estimate: %d %s", w.Code, w.Body)
	}
	if w := request(h.EstimateKnowledge, "POST", "/api/knowledge/estimate", "", `{"folder":"/does/not/exist"}`); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"missing":true`) {
		t.Errorf("missing folder: %d %s", w.Code, w.Body)
	}
	if w := request(h.EstimateKnowledge, "POST", "/api/knowledge/estimate", "", `{"folder":"/tmp/../etc"}`); w.Code != http.StatusBadRequest {
		t.Errorf("path traversal: %d", w.Code)
	}
	if w := request(h.EstimateKnowledge, "POST", "/api/knowledge/estimate", "", `{bad`); w.Code != http.StatusBadRequest {
		t.Errorf("bad json: %d", w.Code)
	}
}
