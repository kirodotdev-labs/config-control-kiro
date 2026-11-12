package browser

import "testing"

func TestCommand(t *testing.T) {
	tests := []struct {
		goos  string
		wsl   bool
		want  string
		fails bool
	}{
		{"windows", false, "rundll32", false},
		{"linux", true, "cmd.exe", false},
		{"darwin", false, "open", false},
		{"linux", false, "xdg-open", false},
		{"plan9", false, "", true},
	}
	for _, tt := range tests {
		name, args, err := command(tt.goos, tt.wsl, "http://127.0.0.1:3030")
		if (err != nil) != tt.fails {
			t.Fatalf("%s/wsl=%v: err=%v", tt.goos, tt.wsl, err)
		}
		if name != tt.want {
			t.Errorf("%s/wsl=%v: got %q want %q", tt.goos, tt.wsl, name, tt.want)
		}
		if !tt.fails && args[len(args)-1] != "http://127.0.0.1:3030" {
			t.Errorf("%s: url must be the last argument, got %v", tt.goos, args)
		}
	}
}
