package launcher

import (
	"errors"
	"os/exec"
	"strings"
	"testing"

	"kiromanager/internal/shared/utils"
)

func TestValidateCommand(t *testing.T) {
	tests := []struct {
		name    string
		command string
		ok      bool
	}{
		{"bare", "kiro-cli", true},
		{"chat", "kiro-cli chat", true},
		{"chat with agent", "kiro-cli chat --agent my-agent_1.2", true},
		{"resume picker", "kiro-cli chat --agent a --resume-picker", true},
		{"empty", "", false},
		{"other binary", "rm -rf /", false},
		{"semicolon injection", "kiro-cli chat; rm -rf ~", false},
		{"pipe injection", "kiro-cli chat | sh", false},
		{"subshell", "kiro-cli $(whoami)", false},
		{"backtick", "kiro-cli `id`", false},
		{"quote", "kiro-cli chat --agent 'x'", false},
		{"newline", "kiro-cli chat\nrm -rf /", false},
		{"prefix trick", "not-kiro-cli chat", false},
		{"double space", "kiro-cli  chat", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := ValidateCommand(tt.command); (err == nil) != tt.ok {
				t.Errorf("ValidateCommand(%q) err=%v, want ok=%v", tt.command, err, tt.ok)
			}
		})
	}
}

func TestResolveDirectory(t *testing.T) {
	dir := t.TempDir()
	if got, err := ResolveDirectory(dir); err != nil || got != dir {
		t.Errorf("existing dir: got %q, %v", got, err)
	}
	if _, err := ResolveDirectory(dir + "/missing"); !errors.Is(err, ErrDirectoryNotFound) {
		t.Errorf("missing dir: want ErrDirectoryNotFound, got %v", err)
	}
	if got, err := ResolveDirectory(""); err != nil || got == "" {
		t.Errorf("empty means home: got %q, %v", got, err)
	}
}

func TestShellAndPSEscape(t *testing.T) {
	if got := shellEscape("it's"); got != `it'\''s` {
		t.Errorf("shellEscape: %q", got)
	}
	if got := psEscape("it's"); got != "it''s" {
		t.Errorf("psEscape: %q", got)
	}
}

func TestBuildCommand(t *testing.T) {
	noTerm := func() string { return "" }
	someTerm := func() string { return "/usr/bin/xterm" }
	for _, p := range []Platform{PlatformWindows, PlatformWSL, PlatformMac} {
		if cmd, err := buildCommand(p, "/tmp", "kiro-cli chat", noTerm); err != nil || cmd == nil {
			t.Errorf("%s: unexpected err=%v", p, err)
		}
	}
	if _, err := buildCommand(PlatformLinux, "/tmp", "kiro-cli chat", noTerm); err == nil {
		t.Error("linux without terminal should error")
	}
	cmd, err := buildCommand(PlatformLinux, "/tmp", "kiro-cli chat", someTerm)
	if err != nil || !strings.Contains(strings.Join(cmd.Args, " "), "kiro-cli chat") {
		t.Errorf("linux command: err=%v args=%v", err, cmd)
	}
}

func TestDetectPlatform(t *testing.T) {
	cases := map[string]Platform{"windows": PlatformWindows, "darwin": PlatformMac, "linux": PlatformLinux}
	for goos, want := range cases {
		if got := detectPlatform(goos, false); got != want {
			t.Errorf("%s: got %s want %s", goos, got, want)
		}
	}
	if got := detectPlatform("linux", true); got != PlatformWSL {
		t.Errorf("wsl: got %s", got)
	}
}

// newTestService returns a Service whose process starter is recorded, not executed.
func newTestService(startErr error) (*Service, *[]*exec.Cmd) {
	var started []*exec.Cmd
	s := &Service{
		logger:       utils.NewLogger(),
		platform:     PlatformLinux,
		findTerminal: func() string { return "/usr/bin/xterm" },
		start: func(c *exec.Cmd) error {
			started = append(started, c)
			return startErr
		},
	}
	return s, &started
}

func TestLaunch(t *testing.T) {
	t.Run("valid command starts one process", func(t *testing.T) {
		s, started := newTestService(nil)
		if err := s.Launch("~", "kiro-cli chat"); err != nil {
			t.Fatalf("Launch: %v", err)
		}
		if len(*started) != 1 {
			t.Fatalf("started %d processes, want 1", len(*started))
		}
	})
	t.Run("invalid command starts nothing", func(t *testing.T) {
		s, started := newTestService(nil)
		if err := s.Launch("~", "kiro-cli; rm -rf ~"); err == nil {
			t.Fatal("expected error")
		}
		if len(*started) != 0 {
			t.Fatal("no process should start for an invalid command")
		}
	})
	t.Run("start failure is returned", func(t *testing.T) {
		s, _ := newTestService(errors.New("boom"))
		if err := s.Launch("~", "kiro-cli"); err == nil {
			t.Fatal("expected start error")
		}
	})
}
