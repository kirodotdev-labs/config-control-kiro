package launcher

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// commandPattern allows only `kiro-cli` followed by plain argument tokens.
// Tokens may contain letters, digits and . _ - / : = @ — never shell
// metacharacters (; | & $ ` ' " < > ( ) spaces-in-token, newlines), so the
// command can be interpolated into a terminal script without injection.
var commandPattern = regexp.MustCompile(`^kiro-cli( [A-Za-z0-9._/:=@-]+)*$`)

// ValidateCommand reports whether command is an allowed kiro-cli invocation.
func ValidateCommand(command string) error {
	if !commandPattern.MatchString(command) {
		return fmt.Errorf("command not allowed: only kiro-cli with plain arguments may be launched")
	}
	return nil
}

// ErrDirectoryNotFound reports a launch directory that is not an existing directory.
var ErrDirectoryNotFound = errors.New("directory not found")

// ResolveDirectory expands ~ (an empty directory means home) and requires the
// result to be an existing directory, so a typo never silently launches in
// the wrong place.
func ResolveDirectory(directory string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	switch {
	case directory == "" || directory == "~":
		return home, nil
	case strings.HasPrefix(directory, "~/"):
		directory = filepath.Join(home, directory[2:])
	}
	if info, err := os.Stat(directory); err != nil || !info.IsDir() {
		return "", fmt.Errorf("%w: %s", ErrDirectoryNotFound, directory)
	}
	return directory, nil
}
