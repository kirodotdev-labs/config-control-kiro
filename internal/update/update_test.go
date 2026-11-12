package update

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// release is a fake GitHub releases site: /releases/latest redirects to the
// tag, /releases/download/v<ver>/<file> serves files.
func release(t *testing.T, version string, files map[string][]byte) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/releases/latest") {
			http.Redirect(w, r, strings.TrimSuffix(r.URL.Path, "latest")+"tag/v"+version, http.StatusFound)
			return
		}
		name := filepath.Base(r.URL.Path)
		if b, ok := files[name]; ok && strings.Contains(r.URL.Path, "/releases/download/v"+version+"/") {
			_, _ = w.Write(b)
			return
		}
		http.NotFound(w, r)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func tarGz(t *testing.T, entries map[string]string) []byte {
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	for name, body := range entries {
		_ = tw.WriteHeader(&tar.Header{Name: name, Mode: 0o755, Size: int64(len(body)), Typeflag: tar.TypeReg})
		_, _ = tw.Write([]byte(body))
	}
	_ = tw.Close()
	_ = gz.Close()
	return buf.Bytes()
}

func zipOf(t *testing.T, entries map[string]string) []byte {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for name, body := range entries {
		h := &zip.FileHeader{Name: name, Method: zip.Deflate}
		h.SetMode(0o755)
		w, _ := zw.CreateHeader(h)
		_, _ = w.Write([]byte(body))
	}
	_ = zw.Close()
	return buf.Bytes()
}

func sign(priv ed25519.PrivateKey, asset, version string, data []byte) []byte {
	sum := sha256.Sum256(data)
	return []byte(FormatSig(ed25519.Sign(priv, Message(asset, version, hex.EncodeToString(sum[:])))))
}

// testUpdater is an updater for the Linux archive, installing over a fake executable.
func testUpdater(t *testing.T, base string) (*Updater, string) {
	t.Helper()
	dir := t.TempDir()
	exe := filepath.Join(dir, "cckiro")
	if err := os.WriteFile(exe, []byte("old"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("CCKIRO_UPDATE_URL", base)
	u := New(Options{Version: "1.0.0", GlobalDir: t.TempDir()})
	u.asset, u.install, u.disabled = "cckiro-linux-amd64.tar.gz", Install{Target: exe, Exe: exe}, ""
	return u, exe
}

func keys(t *testing.T) ed25519.PrivateKey {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	old := PublicKey
	PublicKey = base64.StdEncoding.EncodeToString(pub)
	t.Cleanup(func() { PublicKey = old })
	return priv
}

func TestCheckDownloadsAndVerifies(t *testing.T) {
	priv := keys(t)
	arc := tarGz(t, map[string]string{"cckiro": "new"})
	asset := "cckiro-linux-amd64.tar.gz"
	srv := release(t, "1.1.0", map[string][]byte{asset: arc, asset + ".sig": sign(priv, asset, "1.1.0", arc)})
	u, exe := testUpdater(t, srv.URL+"/owner/repo")
	s := u.Check()
	if s.State != StateReady || s.Latest != "1.1.0" {
		t.Fatalf("status %+v", s)
	}
	if s.DownloadURL != srv.URL+"/owner/repo/releases/latest/download/"+asset {
		t.Errorf("download link %s", s.DownloadURL)
	}
	// Install without restarting: stage and swap, then roll back.
	if err := u.install.stage(filepath.Join(u.staged, "unpacked"), "linux"); err != nil {
		t.Fatal(err)
	}
	if err := u.install.swap(); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(exe); string(b) != "new" {
		t.Errorf("after swap: %q", b)
	}
	if info, _ := os.Stat(exe); info.Mode()&0o100 == 0 && os.PathSeparator == '/' {
		t.Error("the new binary is executable")
	}
	if err := u.install.rollback(); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(exe); string(b) != "old" {
		t.Errorf("after rollback: %q", b)
	}
}

func TestCheckRefusesBadSignatures(t *testing.T) {
	priv := keys(t)
	_, other, _ := ed25519.GenerateKey(rand.Reader)
	arc := tarGz(t, map[string]string{"cckiro": "evil"})
	asset := "cckiro-linux-amd64.tar.gz"
	for name, sig := range map[string][]byte{
		"another key":          sign(other, asset, "1.1.0", arc),
		"another version":      sign(priv, asset, "1.0.9", arc),
		"another platform":     sign(priv, "cckiro-windows-amd64.zip", "1.1.0", arc),
		"a changed archive":    sign(priv, asset, "1.1.0", []byte("something else")),
		"not a signature file": []byte("hello"),
	} {
		t.Run(name, func(t *testing.T) {
			srv := release(t, "1.1.0", map[string][]byte{asset: arc, asset + ".sig": sig})
			u, exe := testUpdater(t, srv.URL+"/o/r")
			if s := u.Check(); s.State != StateError || u.staged != "" {
				t.Errorf("status %+v", s)
			}
			if b, _ := os.ReadFile(exe); string(b) != "old" {
				t.Error("nothing is installed")
			}
		})
	}
	t.Run("no signature at all", func(t *testing.T) {
		srv := release(t, "1.1.0", map[string][]byte{asset: arc})
		u, _ := testUpdater(t, srv.URL+"/o/r")
		if s := u.Check(); s.State != StateError || !strings.Contains(s.Reason, "no signature") {
			t.Errorf("status %+v", s)
		}
	})
}

func TestCheckStates(t *testing.T) {
	keys(t)
	t.Run("up to date", func(t *testing.T) {
		u, _ := testUpdater(t, release(t, "1.0.0", nil).URL+"/o/r")
		if s := u.Check(); s.State != StateUpToDate {
			t.Errorf("%+v", s)
		}
	})
	t.Run("automatic updates off: manual", func(t *testing.T) {
		u, _ := testUpdater(t, release(t, "2.0.0", nil).URL+"/o/r")
		if err := u.SetAuto(false); err != nil {
			t.Fatal(err)
		}
		if s := u.Check(); s.State != StateManual || s.Auto || s.Latest != "2.0.0" {
			t.Errorf("%+v", s)
		}
	})
	t.Run("a version that failed to start: manual", func(t *testing.T) {
		u, _ := testUpdater(t, release(t, "2.0.0", nil).URL+"/o/r")
		_ = u.writeSettings(settingsFile{Skip: "2.0.0"})
		if s := u.Check(); s.State != StateManual || !strings.Contains(s.Reason, "didn't start") {
			t.Errorf("%+v", s)
		}
	})
	t.Run("can't write where the app is: manual", func(t *testing.T) {
		if os.Getuid() == 0 || os.PathSeparator != '/' {
			t.Skip("needs a non-root Unix user")
		}
		u, exe := testUpdater(t, release(t, "2.0.0", nil).URL+"/o/r")
		_ = os.Chmod(filepath.Dir(exe), 0o555)
		t.Cleanup(func() { _ = os.Chmod(filepath.Dir(exe), 0o755) })
		if s := u.Check(); s.State != StateManual || !strings.Contains(s.Reason, "can't write") {
			t.Errorf("%+v", s)
		}
	})
	t.Run("dev builds and off never update", func(t *testing.T) {
		if s := New(Options{Version: "dev", GlobalDir: t.TempDir()}).Check(); s.State != StateDisabled {
			t.Errorf("dev: %+v", s)
		}
		t.Setenv("CCKIRO_UPDATE_URL", "off")
		if s := New(Options{Version: "1.0.0", GlobalDir: t.TempDir()}).Check(); s.State != StateDisabled {
			t.Errorf("off: %+v", s)
		}
		t.Setenv("CCKIRO_UPDATE_URL", "http://example.com/o/r")
		if s := New(Options{Version: "1.0.0", GlobalDir: t.TempDir()}); s.Status().State != StateDisabled {
			t.Error("plain http to a remote host is refused")
		}
	})
}

func TestExtractIsSafe(t *testing.T) {
	for name, data := range map[string][]byte{
		"zip slip":    zipOf(t, map[string]string{"../evil": "x"}),
		"absolute":    zipOf(t, map[string]string{"/etc/evil": "x"}),
		"drive":       zipOf(t, map[string]string{"C:/evil": "x"}),
		"tar slip":    tarGz(t, map[string]string{"../../evil": "x"}),
		"not archive": []byte("plain"),
	} {
		t.Run(name, func(t *testing.T) {
			dir := t.TempDir()
			ext := ".zip"
			if strings.HasPrefix(name, "tar") {
				ext = ".tar.gz"
			}
			a := filepath.Join(dir, "a"+ext)
			_ = os.WriteFile(a, data, 0o600)
			if err := extract(a, filepath.Join(dir, "out")); err == nil {
				t.Error("refused")
			}
			if _, err := os.Stat(filepath.Join(filepath.Dir(dir), "evil")); err == nil {
				t.Error("nothing written outside")
			}
		})
	}
	t.Run("a macOS app, resource forks skipped", func(t *testing.T) {
		dir := t.TempDir()
		a := filepath.Join(dir, "m.zip")
		_ = os.WriteFile(a, zipOf(t, map[string]string{"cckiro.app/Contents/MacOS/cckiro": "bin", "cckiro.app/Contents/Info.plist": "p", "__MACOSX/._x": "r"}), 0o600)
		out := filepath.Join(dir, "out")
		if err := extract(a, out); err != nil {
			t.Fatal(err)
		}
		app := Install{Target: filepath.Join(dir, "Apps", "cckiro.app"), App: true}
		_ = os.MkdirAll(filepath.Join(app.Target, "Contents", "MacOS"), 0o755)
		if err := app.stage(out, "darwin"); err != nil {
			t.Fatal(err)
		}
		if err := app.swap(); err != nil {
			t.Fatal(err)
		}
		if b, _ := os.ReadFile(filepath.Join(app.Target, "Contents", "MacOS", "cckiro")); string(b) != "bin" {
			t.Errorf("app not swapped: %q", b)
		}
		if _, err := os.Stat(filepath.Join(out, "__MACOSX")); err == nil {
			t.Error("resource forks are skipped")
		}
	})
}

func TestLocate(t *testing.T) {
	in := locate(filepath.FromSlash("/Applications/cckiro.app/Contents/MacOS/cckiro"), "darwin")
	if !in.App || in.Target != filepath.FromSlash("/Applications/cckiro.app") {
		t.Errorf("%+v", in)
	}
	if in := locate(filepath.FromSlash("/home/u/cckiro"), "linux"); in.App || in.Target != filepath.FromSlash("/home/u/cckiro") {
		t.Errorf("%+v", in)
	}
	trans := Install{Target: "/private/var/folders/x/AppTranslocation/y/d/cckiro.app"}
	if !strings.Contains(trans.blocker("darwin"), "Applications") {
		t.Error("App Translocation says to move the app")
	}
	if Asset("windows", "amd64") != "cckiro-windows-amd64.zip" || Asset("darwin", "arm64") != "cckiro-mac-arm.zip" || Asset("linux", "arm64") != "" {
		t.Error("asset names")
	}
}

func TestTakeHandoff(t *testing.T) {
	t.Setenv(EnvPort, "3031")
	t.Setenv(EnvToken, strings.Repeat("a", 64))
	t.Setenv(EnvFrom, "1.0.0")
	port, token, from, ok := TakeHandoff()
	if !ok || port != 3031 || len(token) != 64 || from != "1.0.0" {
		t.Errorf("%d %q %q %v", port, token, from, ok)
	}
	if os.Getenv(EnvToken) != "" {
		t.Error("the token is cleared from the environment")
	}
	if _, _, _, ok := TakeHandoff(); ok {
		t.Error("a normal start has no handoff")
	}
}
