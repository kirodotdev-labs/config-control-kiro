package update

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// Install is what the running app replaces: its executable (Windows, Linux),
// or on macOS the whole .app bundle it runs from.
type Install struct {
	Target string // file or .app folder that gets replaced
	Exe    string // what to start afterwards
	App    bool   // Target is a macOS .app bundle
}

// locate finds the install for the executable at exe.
func locate(exe, goos string) Install {
	if goos == "darwin" {
		// <x>.app/Contents/MacOS/<bin>
		macos := filepath.Dir(exe)
		contents := filepath.Dir(macos)
		app := filepath.Dir(contents)
		if filepath.Base(macos) == "MacOS" && filepath.Base(contents) == "Contents" && strings.HasSuffix(app, ".app") {
			return Install{Target: app, Exe: exe, App: true}
		}
	}
	return Install{Target: exe, Exe: exe}
}

// blocker says why the app can't replace itself here, or "" when it can.
func (in Install) blocker(goos string) string {
	if goos == "darwin" && strings.Contains(in.Target, "/AppTranslocation/") {
		return "macOS is running the app from a temporary read-only copy. Move Config Control to your Applications folder to get automatic updates."
	}
	dir := filepath.Dir(in.Target)
	probe, err := os.CreateTemp(dir, ".cckiro-update-probe-*")
	if err != nil {
		return fmt.Sprintf("The app can't write to %s, so it can't replace itself there.", dir)
	}
	name := probe.Name()
	probe.Close()
	_ = os.Remove(name)
	return ""
}

func (in Install) staged() string { return in.Target + ".new" }
func (in Install) backup() string { return in.Target + ".old" }

// stage moves the unpacked new version next to the target, ready to swap.
// unpacked is the folder the archive was extracted into.
func (in Install) stage(unpacked, goos string) error {
	var src string
	switch {
	case in.App:
		src = filepath.Join(unpacked, "cckiro.app")
		if fi, err := os.Stat(filepath.Join(src, "Contents", "MacOS", "cckiro")); err != nil || !fi.Mode().IsRegular() {
			return errors.New("the update has no cckiro.app/Contents/MacOS/cckiro")
		}
		_ = os.Chmod(filepath.Join(src, "Contents", "MacOS", "cckiro"), 0o755)
	case goos == "windows":
		src = filepath.Join(unpacked, "cckiro.exe")
	default:
		src = filepath.Join(unpacked, "cckiro")
	}
	if !in.App {
		fi, err := os.Stat(src)
		if err != nil || !fi.Mode().IsRegular() {
			return fmt.Errorf("the update has no %s", filepath.Base(src))
		}
		_ = os.Chmod(src, 0o755)
	}
	_ = os.RemoveAll(in.staged())
	if err := os.Rename(src, in.staged()); err != nil {
		// The download folder may be on another drive: copy instead.
		if err := copyTree(src, in.staged()); err != nil {
			return fmt.Errorf("couldn't place the update next to the app: %w", err)
		}
	}
	return nil
}

// swap puts the staged version in place and keeps the current one as .old.
// A running executable can be renamed on every OS (on Windows it can't be
// overwritten or deleted, but it can be renamed), so the app swaps itself.
func (in Install) swap() error {
	_ = os.RemoveAll(in.backup())
	if err := os.Rename(in.Target, in.backup()); err != nil {
		return fmt.Errorf("couldn't move the current version aside: %w", err)
	}
	if err := os.Rename(in.staged(), in.Target); err != nil {
		_ = os.Rename(in.backup(), in.Target)
		return fmt.Errorf("couldn't put the new version in place: %w", err)
	}
	return nil
}

// rollback puts the previous version back.
func (in Install) rollback() error {
	if _, err := os.Stat(in.backup()); err != nil {
		return errors.New("no previous version to go back to")
	}
	failed := in.Target + ".failed"
	_ = os.RemoveAll(failed)
	if err := os.Rename(in.Target, failed); err != nil {
		return err
	}
	if err := os.Rename(in.backup(), in.Target); err != nil {
		_ = os.Rename(failed, in.Target)
		return err
	}
	_ = os.RemoveAll(failed) // on Windows the failed exe may still be locked; the next start removes it
	return nil
}

// cleanup removes what a finished update leaves behind. On Windows the old exe
// stays locked until the previous process has exited, so this is retried later.
func (in Install) cleanup() {
	for _, p := range []string{in.backup(), in.staged(), in.Target + ".failed"} {
		_ = os.RemoveAll(p)
	}
}

func copyTree(src, dst string) error {
	return filepath.Walk(src, func(p string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, p)
		target := filepath.Join(dst, rel)
		if info.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("%s isn't a plain file", rel)
		}
		data, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		return os.WriteFile(target, data, info.Mode().Perm())
	})
}

var (
	currentOS = runtime.GOOS
	goarch    = runtime.GOARCH
)
