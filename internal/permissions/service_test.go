package permissions

import (
	"os"
	"path/filepath"
	"testing"

	"kiromanager/internal/shared/utils"
	"kiromanager/internal/system"
)

func newTestService(t *testing.T) (*Service, string) {
	t.Helper()
	home := t.TempDir()
	t.Setenv("KIRO_HOME", home)
	logger := utils.NewLogger()
	return NewService(system.NewKiroService(logger, "test"), logger), filepath.Join(home, "settings", "permissions.yaml")
}

func TestGetMissingFileIsEmptyPolicy(t *testing.T) {
	svc, _ := newTestService(t)
	doc, err := svc.Get()
	if err != nil || doc.Exists {
		t.Fatalf("doc=%+v err=%v", doc, err)
	}
}

func TestGetDescribesFileWithoutParsingIt(t *testing.T) {
	svc, path := newTestService(t)
	_ = os.MkdirAll(filepath.Dir(path), 0o755)
	// Anything Kiro writes, however it is formatted: the browser parses it.
	original := "rules: |\n  free text\nodd: {a: [1, 2]}\n"
	_ = os.WriteFile(path, []byte(original), 0o644)
	doc, err := svc.Get()
	if err != nil || !doc.Exists || doc.Path != path || doc.Trust != "" {
		t.Fatalf("describe: %+v %v", doc, err)
	}
	if data, _ := os.ReadFile(path); string(data) != original {
		t.Error("describing must leave the file untouched")
	}
}

func TestMeta(t *testing.T) {
	svc, _ := newTestService(t)
	if m := svc.Meta(); len(m["effects"].([]string)) != 4 || len(m["presets"].([]Preset)) != 7 {
		t.Errorf("meta: %v", m)
	}
}

func TestWorkspaceTrust(t *testing.T) {
	svc, _ := newTestService(t)
	if doc, _ := svc.Get(); doc.Trust != "" {
		t.Errorf("Global has no trust state: %q", doc.Trust)
	}
	proj := t.TempDir()
	if err := svc.kiroService.SetWorkspace(proj); err != nil {
		t.Fatal(err)
	}
	if doc, _ := svc.Get(); doc.Trust != "untrusted" {
		t.Errorf("no file yet: %q", doc.Trust)
	}
	path := svc.kiroService.PermissionsPath()
	_ = os.MkdirAll(filepath.Dir(path), 0o700)
	_ = os.WriteFile(path, []byte("rules: []\nworkspaceTrusted: true\n"), 0o600)
	if doc, _ := svc.Get(); doc.Trust != "trusted" {
		t.Errorf("Kiro's saved trust is read: %q", doc.Trust)
	}
	_ = os.WriteFile(path, []byte("rules: []\nworkspaceTrusted: true\nworkspaceTrustCase: exact\n"), 0o600)
	if doc, _ := svc.Get(); doc.Trust != "untrusted" {
		t.Errorf("a case-exact entry is not folded trust: %q", doc.Trust)
	}
}

func TestAdminPolicy(t *testing.T) {
	svc, _ := newTestService(t)
	dir := t.TempDir()
	old := managedPath
	t.Cleanup(func() { managedPath = old })
	managedPath = func() string { return filepath.Join(dir, "managed-settings.json") }
	if doc, _ := svc.Get(); doc.Admin != nil {
		t.Error("no policy deployed")
	}
	_ = os.WriteFile(managedPath(), []byte(`{"rules":[{"capability":"web_fetch","effect":"deny"},{"capability":"shell","match":["rm *"],"effect":"ask"}]}`), 0o644)
	doc, _ := svc.Get()
	if doc.Admin == nil || len(doc.Admin.Rules) != 2 || doc.Admin.Rules[1].Match[0] != "rm *" || doc.Admin.Error != "" {
		t.Errorf("policy: %+v", doc.Admin)
	}
	_ = os.WriteFile(managedPath(), []byte(`{broken`), 0o644)
	if doc, _ := svc.Get(); doc.Admin == nil || doc.Admin.Error == "" {
		t.Errorf("broken policy is reported: %+v", doc.Admin)
	}
}
