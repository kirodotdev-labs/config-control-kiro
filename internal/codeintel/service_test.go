package codeintel

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

func TestInfo(t *testing.T) {
	t.Setenv("KIRO_HOME", t.TempDir())
	kiro := system.NewKiroService(utils.NewLogger(), "test")
	ws := t.TempDir()
	write := func(rel string) {
		p := filepath.Join(ws, rel)
		_ = os.MkdirAll(filepath.Dir(p), 0o755)
		_ = os.WriteFile(p, []byte("x"), 0o644)
	}
	write("go.mod")
	write("web/src/app.tsx")
	write("node_modules/lib/x.py") // excluded, like Kiro
	write("tools/run.RB")
	if err := kiro.SetWorkspace(ws); err != nil {
		t.Fatal(err)
	}
	svc := NewService(kiro)
	svc.lookPath = func(c string) (string, error) {
		if c == "gopls" {
			return "/usr/bin/gopls", nil
		}
		return "", errors.New("not found")
	}
	got := svc.Info([]string{"gopls", "clangd", " "})
	if strings.Join(got.Detected, ",") != "go,ruby,typescript" {
		t.Errorf("detected: %v", got.Detected)
	}
	if !got.Installed["gopls"] || got.Installed["clangd"] || len(got.Installed) != 2 {
		t.Errorf("installed: %v", got.Installed)
	}

	w := httptest.NewRecorder()
	NewHandler(svc).GetInfo(w, httptest.NewRequest(http.MethodGet, "/api/codeintel?commands=gopls", nil))
	var body Info
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &body) != nil || !body.Installed["gopls"] {
		t.Errorf("%d %s", w.Code, w.Body)
	}
}
