package system

import (
	"os"
	"path/filepath"
	"testing"
)

// The expected hashes were produced by running kiro-cli's own identity
// functions (tui.js) on the same inputs, for Linux and in win32 mode.
func TestWorkspaceRootMatchesKiro(t *testing.T) {
	cases := []struct{ goos, path, want string }{
		{"linux", "/tmp/cck-smoke/proj", "460bde810831b00e"},
		{"linux", "/tmp/wr/a/b/", "906fcfc104c41ebf"},
		{"linux", "/tmp/wr/a/./b/../b", "906fcfc104c41ebf"},
		{"windows", `C:\Users\Me\Proj`, "80e537bce8d64b25"},
		{"windows", `C:\Users\Me\Proj\`, "80e537bce8d64b25"},
		{"windows", `c:\users\me\proj`, "80e537bce8d64b25"},
		{"windows", `C:\Users\Me\.\Proj\..\Proj`, "80e537bce8d64b25"},
		{"windows", `D:\`, "dea2ec2c3c30894f"},
		{"windows", `\\server\share\Repo`, "ac1eb3e234ece9b7"},
	}
	for _, c := range cases {
		if got := hashRoot(workspaceRoot(c.path, c.goos)); got != c.want {
			t.Errorf("%s %q: got %s want %s (root %q)", c.goos, c.path, got, c.want, workspaceRoot(c.path, c.goos))
		}
	}
}

func TestWorkspaceRootHashResolvesSymlinks(t *testing.T) {
	dir := t.TempDir()
	real := filepath.Join(dir, "real")
	_ = os.Mkdir(real, 0o755)
	link := filepath.Join(dir, "link")
	if err := os.Symlink(real, link); err != nil {
		t.Skip("symlinks unavailable")
	}
	if workspaceRootHash(link) != workspaceRootHash(real) {
		t.Error("a symlinked workspace maps to the same permissions file as its target")
	}
	if workspaceRootHash(filepath.Join(link, "new")) != workspaceRootHash(filepath.Join(real, "new")) {
		t.Error("a not-yet-existing folder resolves its existing parent")
	}
}
