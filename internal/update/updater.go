// Package update keeps Config Control up to date by itself. It checks the
// public repository's newest release, downloads the archive for this system,
// and installs it only when the release's signature (ed25519, over the
// archive's name, version and SHA-256) matches the public key built into the
// app. It then swaps the executable (or the macOS .app), starts the new
// version on the same port with the same session, and goes back to the old
// one if the new version doesn't come up. Nothing is shown unless it can't
// update itself; the UI then offers a direct download.
//
// It can be switched off in the app (kept in <global>/kiroui/update.json) or,
// for a whole machine, with CCKIRO_UPDATE_URL=off.
package update

import (
	"context"
	"crypto/ed25519"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"kiromanager/internal/shared/utils"
)

// PublicKey is the base64 ed25519 key whose signatures are trusted. Its private
// half signs releases in the private repo's release workflow and is never in this code.
var PublicKey = "KKRAjU/0nEBa1pMClvYoT7BTeQ8nWjxn/z4yBtV50QU="

// States the UI shows.
const (
	StateIdle        = "idle"        // not checked yet
	StateChecking    = "checking"    //
	StateUpToDate    = "uptodate"    //
	StateDownloading = "downloading" //
	StateReady       = "ready"       // verified and waiting for a quiet moment to install
	StateApplying    = "applying"    //
	StateManual      = "manual"      // a newer version exists, but it must be downloaded by hand (see Reason)
	StateError       = "error"       // the check or download failed (see Reason); retried later
	StateDisabled    = "disabled"    // this build or machine doesn't self-update
)

// Status is what GET /api/update answers.
type Status struct {
	Current     string `json:"current"`
	Latest      string `json:"latest,omitempty"`
	State       string `json:"state"`
	Auto        bool   `json:"auto"`              // automatic updates switched on
	Reason      string `json:"reason,omitempty"`  // why it can't update itself, or what failed
	DownloadURL string `json:"downloadURL"`       // the newest archive for this system, for a manual update (releases page when there's none)
	ReleasesURL string `json:"releasesURL"`       //
	Checked     string `json:"checked,omitempty"` // RFC 3339
	UpdatedFrom string `json:"updatedFrom,omitempty"`
}

// Options wires the updater into the app.
type Options struct {
	Version     string
	GlobalDir   string // the Kiro home; settings go in kiroui/update.json
	Port        int
	Token       string
	Logger      *utils.Logger
	Shutdown    func(context.Context) error // stops this process's HTTP server
	Exit        func(code int)              // ends this process (os.Exit)
	UpdatedFrom string                      // set when this process was started by an update
}

// Updater checks for, downloads and installs new versions.
type Updater struct {
	opt      Options
	src      *source
	pub      ed25519.PublicKey
	asset    string
	install  Install
	settings string
	every    time.Duration
	idleWait time.Duration

	mu       sync.Mutex
	status   Status
	staged   string // the verified, unpacked new version
	lastSeen time.Time
	disabled string // why this process never self-updates
}

type settingsFile struct {
	Auto *bool  `json:"auto,omitempty"`
	Skip string `json:"skip,omitempty"` // a version that failed to start here; not installed again automatically
}

// New creates the updater. It never fails: a build or machine that can't
// self-update reports StateDisabled or StateManual with a reason.
func New(opt Options) *Updater {
	if opt.Exit == nil {
		opt.Exit = os.Exit
	}
	u := &Updater{opt: opt, every: 6 * time.Hour, idleWait: 10 * time.Minute, lastSeen: time.Now(),
		settings: filepath.Join(opt.GlobalDir, "kiroui", "update.json"), asset: Asset(currentOS, goarch)}
	if d, err := time.ParseDuration(os.Getenv("CCKIRO_UPDATE_EVERY")); err == nil && d >= time.Second {
		u.every = d
	}
	if d, err := time.ParseDuration(os.Getenv("CCKIRO_UPDATE_IDLE")); err == nil && d >= time.Second {
		u.idleWait = d
	}
	base := os.Getenv("CCKIRO_UPDATE_URL")
	switch {
	case base == "off":
		u.disabled = "Automatic updates are switched off on this computer (CCKIRO_UPDATE_URL=off)."
	case base == "":
		base = DefaultSource
	}
	src, err := newSource(map[bool]string{true: DefaultSource, false: base}[base == "off"], opt.Version)
	if err != nil {
		u.disabled, src = err.Error(), &source{base: DefaultSource}
	}
	u.src = src
	if pub, err := ParsePublicKey(PublicKey); err == nil {
		u.pub = pub
	} else if u.disabled == "" {
		u.disabled = err.Error()
	}
	if !versionRe(opt.Version) && u.disabled == "" {
		u.disabled = "This is a development build, which doesn't update itself."
	}
	if u.asset == "" && u.disabled == "" {
		u.disabled = "There is no release for this system yet."
	}
	if exe, err := os.Executable(); err == nil {
		if real, err := filepath.EvalSymlinks(exe); err == nil {
			exe = real
		}
		u.install = locate(exe, currentOS)
	}
	u.status = Status{Current: opt.Version, State: StateIdle, Auto: u.readSettings().autoOn(), UpdatedFrom: opt.UpdatedFrom,
		ReleasesURL: u.src.releasesURL()}
	if u.disabled != "" {
		u.status.State, u.status.Reason = StateDisabled, u.disabled
	}
	return u
}

func (s settingsFile) autoOn() bool { return s.Auto == nil || *s.Auto }

func (u *Updater) readSettings() settingsFile {
	var s settingsFile
	if b, err := os.ReadFile(u.settings); err == nil {
		_ = json.Unmarshal(b, &s)
	}
	return s
}

func (u *Updater) writeSettings(s settingsFile) error {
	b, _ := json.MarshalIndent(s, "", "  ")
	return utils.WriteFileAtomic(u.settings, append(b, '\n'))
}

// Status returns the current state.
func (u *Updater) Status() Status {
	u.mu.Lock()
	defer u.mu.Unlock()
	s := u.status
	s.DownloadURL = u.src.downloadURL(u.asset)
	return s
}

// Seen records that someone is using the app (an API request), which delays an install.
func (u *Updater) Seen() {
	u.mu.Lock()
	u.lastSeen = time.Now()
	u.mu.Unlock()
}

// SetAuto switches automatic updates on or off.
func (u *Updater) SetAuto(on bool) error {
	s := u.readSettings()
	s.Auto = &on
	if err := u.writeSettings(s); err != nil {
		return err
	}
	u.mu.Lock()
	u.status.Auto = on
	if !on && u.status.State == StateReady && Newer(u.status.Latest, u.opt.Version) {
		u.status.State, u.status.Reason = StateManual, "Automatic updates are off."
	}
	u.mu.Unlock()
	if on && u.disabled == "" {
		// Look again now: a version that waited for a manual download may install by itself.
		u.set(func(s *Status) {
			if s.State == StateManual {
				s.State = StateIdle
			}
		})
		go u.Check()
	}
	return nil
}

// Run checks shortly after start and then every few hours, and installs a
// ready update once nobody has used the app for a while. It returns when ctx ends.
func (u *Updater) Run(ctx context.Context) {
	if u.disabled != "" {
		return
	}
	u.install.cleanup() // what a previous update left behind
	next := time.NewTimer(30 * time.Second)
	if u.every < 30*time.Second {
		next.Reset(u.every)
	}
	tick := time.NewTicker(minDur(u.idleWait/4, 30*time.Second))
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-next.C:
			u.Check()
			next.Reset(u.every)
		case <-tick.C:
			u.install.cleanup()
			u.mu.Lock()
			idle := u.status.State == StateReady && u.status.Auto && time.Since(u.lastSeen) >= u.idleWait
			u.mu.Unlock()
			if idle {
				u.log("Installing the update while the app is idle")
				_ = u.Apply()
			}
		}
	}
}

func minDur(a, b time.Duration) time.Duration {
	if a < b && a > 0 {
		return a
	}
	return b
}

func (u *Updater) set(f func(*Status)) {
	u.mu.Lock()
	f(&u.status)
	u.mu.Unlock()
}

func (u *Updater) log(format string, args ...any) {
	if u.opt.Logger != nil {
		u.opt.Logger.Info("update: "+format, args...)
	}
}

// Check looks for a newer release and, when automatic updates are on and the
// app can replace itself, downloads and verifies it.
func (u *Updater) Check() Status {
	if u.disabled != "" {
		return u.Status()
	}
	u.mu.Lock()
	if busy := u.status.State; busy == StateChecking || busy == StateDownloading || busy == StateApplying || busy == StateReady {
		u.mu.Unlock()
		return u.Status()
	}
	u.status.State, u.status.Reason = StateChecking, ""
	u.mu.Unlock()

	latest, err := u.src.latest()
	now := time.Now().UTC().Format(time.RFC3339)
	if err != nil {
		u.set(func(s *Status) { s.State, s.Reason, s.Checked = StateError, err.Error(), now })
		return u.Status()
	}
	u.set(func(s *Status) { s.Latest, s.Checked = latest, now })
	if !Newer(latest, u.opt.Version) {
		u.set(func(s *Status) { s.State = StateUpToDate })
		return u.Status()
	}
	st := u.readSettings()
	manual := func(reason string) Status {
		u.set(func(s *Status) { s.State, s.Reason = StateManual, reason })
		return u.Status()
	}
	switch {
	case !st.autoOn():
		return manual("Automatic updates are off.")
	case st.Skip == latest:
		return manual(fmt.Sprintf("Version %s didn't start on this computer, so the app went back to %s. Download it to try again.", latest, u.opt.Version))
	}
	if why := u.install.blocker(currentOS); why != "" {
		return manual(why)
	}
	u.set(func(s *Status) { s.State = StateDownloading })
	dir, err := u.download(latest)
	if err != nil {
		_ = os.RemoveAll(dir)
		u.log("download failed: %v", err)
		u.set(func(s *Status) { s.State, s.Reason = StateError, err.Error() })
		return u.Status()
	}
	u.mu.Lock()
	u.staged = dir
	u.status.State, u.status.Reason = StateReady, ""
	u.mu.Unlock()
	u.log("version %s downloaded and verified", latest)
	return u.Status()
}

// download fetches, verifies and unpacks a release into a temporary folder.
func (u *Updater) download(version string) (string, error) {
	dir, err := os.MkdirTemp(filepath.Dir(u.install.Target), ".cckiro-update-")
	if err != nil {
		if dir, err = os.MkdirTemp("", "cckiro-update-"); err != nil {
			return "", err
		}
	}
	archive := filepath.Join(dir, u.asset)
	sum, err := u.src.fetch(version, u.asset, archive, maxArchive)
	if err != nil {
		return dir, err
	}
	sigPath := archive + ".sig"
	if _, err := u.src.fetch(version, u.asset+".sig", sigPath, maxSig); err != nil {
		return dir, fmt.Errorf("the release has no signature for %s, so it isn't installed: %w", u.asset, err)
	}
	sig, err := os.ReadFile(sigPath)
	if err != nil {
		return dir, err
	}
	if err := Verify(u.pub, u.asset, version, sum, string(sig)); err != nil {
		return dir, err
	}
	unpacked := filepath.Join(dir, "unpacked")
	if err := os.MkdirAll(unpacked, 0o755); err != nil {
		return dir, err
	}
	if err := extract(archive, unpacked); err != nil {
		return dir, err
	}
	return dir, nil
}

// Apply installs the downloaded update and restarts into it. On success this
// process exits; it returns only when the update couldn't be installed.
func (u *Updater) Apply() error {
	u.mu.Lock()
	if u.status.State != StateReady || u.staged == "" {
		u.mu.Unlock()
		return errors.New("no update is ready to install")
	}
	u.status.State = StateApplying
	staged, version := u.staged, u.status.Latest
	u.mu.Unlock()
	fail := func(err error) error {
		u.log("install failed: %v", err)
		u.set(func(s *Status) { s.State, s.Reason = StateError, err.Error() })
		return err
	}
	if err := u.install.stage(filepath.Join(staged, "unpacked"), currentOS); err != nil {
		return fail(err)
	}
	_ = os.RemoveAll(staged)
	if err := u.install.swap(); err != nil {
		return fail(err)
	}
	u.log("installed %s; restarting", version)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	_ = u.opt.Shutdown(ctx) // free the port for the new version
	cancel()
	child, exited, err := u.start(u.install.Exe, version)
	if err == nil && u.healthy(version, 45*time.Second, exited) {
		u.opt.Exit(0)
		return nil
	}
	// The new version didn't come up: put this one back, remember not to retry
	// that version automatically, and start this version again on the same port.
	if child != nil && child.Process != nil {
		_ = child.Process.Kill()
	}
	u.log("version %s didn't start (%v); going back to %s", version, err, u.opt.Version)
	if rerr := u.install.rollback(); rerr != nil {
		u.log("couldn't go back: %v", rerr)
	}
	s := u.readSettings()
	s.Skip = version
	if err := u.writeSettings(s); err != nil {
		// Without the note this version may be tried again after the next check.
		u.log("couldn't record that %s failed (%v); it may be tried again", version, err)
	}
	if _, _, err := u.start(u.install.Exe, ""); err != nil {
		u.log("couldn't restart: %v", err)
		u.opt.Exit(1)
		return err
	}
	u.opt.Exit(0)
	return nil
}

// Handoff variables tell a restarted process to take over this one's port and
// session, so the open browser tab keeps working. They live only in the
// child's environment, never on disk, and the child removes them at start.
const (
	EnvPort  = "CCKIRO_HANDOFF_PORT"
	EnvToken = "CCKIRO_HANDOFF_TOKEN"
	EnvFrom  = "CCKIRO_UPDATED_FROM"
)

// start runs exe with this process's arguments and the handoff; exited closes when it ends.
func (u *Updater) start(exe, newVersion string) (*exec.Cmd, <-chan struct{}, error) {
	cmd := exec.Command(exe, os.Args[1:]...)
	cmd.Env = append(os.Environ(), fmt.Sprintf("%s=%d", EnvPort, u.opt.Port), EnvToken+"="+u.opt.Token)
	if newVersion != "" {
		cmd.Env = append(cmd.Env, EnvFrom+"="+u.opt.Version)
	}
	cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
	detach(cmd)
	if err := cmd.Start(); err != nil {
		return nil, nil, err
	}
	exited := make(chan struct{})
	go func() { _ = cmd.Wait(); close(exited) }()
	return cmd, exited, nil
}

// healthy waits until the new process answers on this port as the expected
// version; it gives up early when that process has exited.
func (u *Updater) healthy(version string, wait time.Duration, exited <-chan struct{}) bool {
	client := &http.Client{Timeout: 2 * time.Second}
	deadline := time.Now().Add(wait)
	for time.Now().Before(deadline) {
		req, _ := http.NewRequest(http.MethodGet, fmt.Sprintf("http://127.0.0.1:%d/api/update", u.opt.Port), nil)
		req.Header.Set("Authorization", "Bearer "+u.opt.Token)
		if resp, err := client.Do(req); err == nil {
			var s Status
			ok := resp.StatusCode == http.StatusOK && json.NewDecoder(resp.Body).Decode(&s) == nil && s.Current == version
			resp.Body.Close()
			if ok {
				return true
			}
		}
		select {
		case <-exited:
			return false
		case <-time.After(500 * time.Millisecond):
		}
	}
	return false
}

// TakeHandoff reads and clears the handoff a restarting update left in this
// process's environment: the port and session token to keep, and the version
// it was updated from. ok is false for a normal start.
func TakeHandoff() (port int, token, from string, ok bool) {
	p, t := os.Getenv(EnvPort), os.Getenv(EnvToken)
	from = os.Getenv(EnvFrom)
	for _, k := range []string{EnvPort, EnvToken, EnvFrom} {
		_ = os.Unsetenv(k) // never passed on to kiro-cli or terminals this process starts
	}
	if _, err := fmt.Sscanf(p, "%d", &port); err != nil || port <= 0 || len(t) < 32 {
		return 0, "", "", false
	}
	return port, t, from, true
}
