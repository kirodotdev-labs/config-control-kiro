package kirocli

import (
	"bytes"
	"context"
	"errors"
	"os/exec"
	"time"
)

// maxOutput caps how much of a run's stdout or stderr is kept.
const maxOutput = 4 << 20

// Result is the outcome of one kiro-cli run.
type Result struct {
	Stdout   []byte
	Stderr   []byte
	ExitCode int
	TimedOut bool
}

// Runner executes kiro-cli. Exec is replaceable so tests never run the real binary.
type Runner struct {
	Find func() string
	Exec func(ctx context.Context, bin string, args ...string) (Result, error)
	// Pipe starts kiro-cli acp for CallACP; nil starts the real one.
	Pipe ACPPipe
}

// NewRunner returns a Runner that runs the installed kiro-cli.
func NewRunner() *Runner { return &Runner{Find: Locate, Exec: execCommand} }

// Run starts kiro-cli with args and waits up to timeout. It returns a
// Problem (never a raw error) when kiro-cli is missing, times out, or exits
// non-zero; the Result is still returned so callers can show the output.
func (r *Runner) Run(ctx context.Context, timeout time.Duration, args ...string) (Result, *Problem) {
	bin := r.Find()
	if bin == "" {
		return Result{}, problem(NotInstalled, "")
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	res, err := r.Exec(ctx, bin, args...)
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		res.TimedOut = true
		return res, problem(TimedOut, "")
	}
	if err != nil && res.ExitCode == 0 {
		return res, problem(Failed, err.Error())
	}
	return res, Classify(res)
}

// execCommand runs bin with no stdin, capped output, and the process killed
// (with any children it waits on) when ctx ends.
func execCommand(ctx context.Context, bin string, args ...string) (Result, error) {
	cmd := exec.CommandContext(ctx, bin, args...)
	var out, errOut cappedBuffer
	cmd.Stdout, cmd.Stderr = &out, &errOut
	cmd.WaitDelay = 2 * time.Second
	err := cmd.Run()
	res := Result{Stdout: out.Bytes(), Stderr: errOut.Bytes()}
	var exit *exec.ExitError
	if errors.As(err, &exit) {
		res.ExitCode = exit.ExitCode()
		return res, nil
	}
	return res, err
}

// cappedBuffer keeps the first maxOutput bytes and discards the rest.
type cappedBuffer struct{ bytes.Buffer }

func (b *cappedBuffer) Write(p []byte) (int, error) {
	if room := maxOutput - b.Len(); room > 0 {
		if len(p) > room {
			b.Buffer.Write(p[:room])
		} else {
			b.Buffer.Write(p)
		}
	}
	return len(p), nil
}
