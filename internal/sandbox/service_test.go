package sandbox

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kiromanager/internal/shared/ordered"
	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

func newTestService(t *testing.T) (*Service, string) {
	t.Helper()
	home := t.TempDir()
	t.Setenv("KIRO_HOME", home)
	logger := utils.NewLogger()
	return NewService(system.NewKiroService(logger, "test"), logger), filepath.Join(home, "settings", "sandbox.json")
}

func TestSandboxRoundTripKeepsOrder(t *testing.T) {
	svc, path := newTestService(t)
	if doc, err := svc.Get(); err != nil || doc.Exists {
		t.Fatalf("missing file: %+v %v", doc, err)
	}
	cfg := ordered.New()
	_ = json.Unmarshal([]byte(`{"enabled":true,"network":{"allow":["x"]},"alpha":1}`), cfg)
	if err := svc.Save(cfg); err != nil {
		t.Fatal(err)
	}
	doc, err := svc.Get()
	if err != nil || !doc.Exists || strings.Join(doc.Config.Keys(), ",") != "enabled,network,alpha" {
		t.Fatalf("round trip: %+v %v", doc, err)
	}
	if err := svc.Save(nil); err == nil {
		t.Error("nil config must be rejected")
	}
	_ = os.WriteFile(path, []byte("{broken"), 0o644)
	if _, err := svc.Get(); err == nil {
		t.Error("broken JSON must surface an error")
	}
}

func TestPlatformCheck(t *testing.T) {
	old := lookPath
	t.Cleanup(func() { lookPath = old })
	present := map[string]bool{}
	lookPath = func(name string) (string, error) {
		if present[name] {
			return "/usr/bin/" + name, nil
		}
		return "", errors.New("not found")
	}
	if p := platformCheck("linux"); p.Ready || p.Missing[0] != "bwrap" || p.Partial[0] != "socat" || p.Note == "" {
		t.Errorf("linux without bwrap: %+v", p)
	}
	present["bwrap"], present["socat"] = true, true
	if p := platformCheck("linux"); !p.Ready || len(p.Missing)+len(p.Partial) != 0 {
		t.Errorf("linux ready: %+v", p)
	}
	present["sandbox-exec"] = true
	if p := platformCheck("darwin"); !p.Ready {
		t.Errorf("mac: %+v", p)
	}
	if p := platformCheck("windows"); !p.Ready || !strings.Contains(p.Note, "/sandbox setup") {
		t.Errorf("windows: %+v", p)
	}
}

func TestWorkspaceSeesGlobalPolicy(t *testing.T) {
	svc, _ := newTestService(t)
	kiro := svc.kiroService
	_ = os.MkdirAll(filepath.Dir(kiro.GlobalSandboxPath()), 0o755)
	_ = os.WriteFile(kiro.GlobalSandboxPath(), []byte(`{"enabled":true,"networkAccess":"COMMON_DEPENDENCIES"}`), 0o644)
	if doc, _ := svc.Get(); doc.Global != nil {
		t.Error("Global has no parent policy")
	}
	if err := kiro.SetWorkspace(t.TempDir()); err != nil {
		t.Fatal(err)
	}
	doc, _ := svc.Get()
	if doc.Global["networkAccess"] != "COMMON_DEPENDENCIES" || doc.Global["enabled"] != true {
		t.Errorf("global: %+v", doc.Global)
	}
}
