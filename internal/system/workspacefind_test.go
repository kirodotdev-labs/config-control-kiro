package system

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kiromanager/internal/shared/utils"
)

func TestWorkspaceSurfacesAgentsMDKiroignorePrompts(t *testing.T) {
	home := t.TempDir()
	t.Setenv("KIRO_HOME", home)
	proj := t.TempDir()
	for rel, body := range map[string]string{
		"AGENTS.md":                "# root",
		"services/api/AGENTS.md":   "# api",
		"node_modules/x/AGENTS.md": "# dep",
		".git/AGENTS.md":           "# hidden",
		".kiroignore":              ".env\n",
		"secrets/.kiroignore":      "*\n",
		".kiro/prompts/review.md":  "Review $ARGUMENTS",
		".kiro/prompts/notes.txt":  "not a prompt",
		".kiro/steering/style.md":  "---\ninclusion: always\n---\n",
	} {
		p := filepath.Join(proj, filepath.FromSlash(rel))
		_ = os.MkdirAll(filepath.Dir(p), 0o755)
		_ = os.WriteFile(p, []byte(body), 0o644)
	}
	k := NewKiroService(utils.NewLogger(), "test")
	if err := k.SetWorkspace(proj); err != nil {
		t.Fatal(err)
	}
	byKind := map[string]*SurfaceNode{}
	for _, n := range k.Surfaces() {
		byKind[n.Kind] = n
	}
	var steering []string
	for _, c := range byKind[KindSteering].Children {
		steering = append(steering, c.Name)
	}
	if got := strings.Join(steering, ","); got != "style.md,AGENTS.md (project root),AGENTS.md (services/api)" {
		t.Errorf("steering: %s", got)
	}
	ig := byKind[KindKiroignore]
	if ig.Path != filepath.Join(proj, ".kiroignore") || !ig.Exists || len(ig.Children) != 1 || ig.Children[0].Name != "secrets/.kiroignore" {
		t.Errorf("kiroignore: %+v %+v", ig, ig.Children)
	}
	pr := byKind[KindPrompts]
	if len(pr.Children) != 1 || pr.Children[0].Name != "review.md" {
		t.Errorf("prompts: %+v", pr.Children)
	}
	if _, ok := byKind[KindPolicy]; ok {
		t.Error("admin policy is a Global item")
	}

	_ = k.SetGlobal()
	byKind = map[string]*SurfaceNode{}
	for _, n := range k.Surfaces() {
		byKind[n.Kind] = n
	}
	if byKind[KindKiroignore].Path != filepath.Join(home, "settings", "kiroignore") {
		t.Errorf("global kiroignore: %s", byKind[KindKiroignore].Path)
	}
}

func TestManagedSettingsPath(t *testing.T) {
	if ManagedSettingsPath("darwin") != "/Library/Application Support/Kiro/managed-settings.json" || ManagedSettingsPath("linux") != "/etc/kiro/managed-settings.json" {
		t.Error("unix paths")
	}
	t.Setenv("ProgramData", `C:\ProgramData`)
	if !strings.HasSuffix(ManagedSettingsPath("windows"), "managed-settings.json") || !strings.Contains(ManagedSettingsPath("windows"), "Kiro") {
		t.Error("windows path")
	}
}
