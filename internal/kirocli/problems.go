package kirocli

import (
	"net/http"
	"regexp"
	"strings"

	"kiromanager/internal/shared/utils"
)

// Problem codes. Every failed kiro-cli run maps to exactly one.
const (
	NotInstalled = "NOT_INSTALLED"
	NotSignedIn  = "NOT_SIGNED_IN"
	Unreachable  = "UNREACHABLE"
	TimedOut     = "TIMED_OUT"
	Unsupported  = "UNSUPPORTED" // this kiro-cli version lacks the command
	AgentMissing = "AGENT_NOT_FOUND"
	MCPStartup   = "MCP_STARTUP_FAILED"
	Failed       = "FAILED"
)

// Problem explains a failed kiro-cli run to the user.
type Problem struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Fix     string `json:"fix,omitempty"`
	Detail  string `json:"detail,omitempty"` // kiro-cli's own output, for "copy details"
}

func (p *Problem) Error() string { return p.Message }

// AppError converts p for an HTTP response (502: the failure is in kiro-cli,
// not in the request).
func (p *Problem) AppError() *utils.AppError {
	e := utils.NewAppError(p.Message, http.StatusBadGateway, p.Code)
	e.Fix, e.Detail = p.Fix, p.Detail
	return e
}

var messages = map[string][2]string{
	NotInstalled: {"Kiro CLI isn't installed on this computer.", "Install it from kiro.dev/downloads, then press Refresh."},
	NotSignedIn:  {"You aren't signed in to Kiro.", "Run kiro-cli login in a terminal, then press Refresh."},
	Unreachable:  {"Kiro can't be reached.", "Check your internet connection or VPN, then press Refresh."},
	TimedOut:     {"Kiro CLI didn't respond in time.", "Try again. If it keeps happening, run kiro-cli doctor in a terminal."},
	Unsupported:  {"Your version of Kiro CLI doesn't support this yet.", "Update it with kiro-cli update, then press Refresh."},
	AgentMissing: {"Kiro couldn't find that agent.", "Check the agent's name, and that the chat starts in the right folder."},
	MCPStartup:   {"A required MCP server didn't start.", "Check the server's command and settings under MCP servers."},
	Failed:       {"Kiro CLI reported an error.", "See the details below."},
}

func problem(code, detail string) *Problem {
	m := messages[code]
	return &Problem{Code: code, Message: m[0], Fix: m[1], Detail: strings.TrimSpace(detail)}
}

var (
	unsupportedRe = regexp.MustCompile(`(?i)unrecognized subcommand|unexpected argument|unknown (sub)?command`)
	signedOutRe   = regexp.MustCompile(`(?i)not (logged|signed) in|no (valid )?(token|credentials)|please (log|sign) ?in|login required|unauthori[sz]ed|expired`)
	networkRe     = regexp.MustCompile(`(?i)dispatch failure|connection (refused|reset|timed out)|could not connect|dns|network is unreachable|no route to host|tls handshake|failed to lookup|timed out`)
)

// Classify maps a finished run to a Problem, or nil when it succeeded. Exit
// codes follow kiro.dev/docs/reference/exit-codes; for exit 1 (a general
// failure) the error text decides between the common causes.
func Classify(res Result) *Problem {
	if res.ExitCode == 0 {
		return nil
	}
	text := string(res.Stderr)
	if strings.TrimSpace(text) == "" {
		text = string(res.Stdout)
	}
	switch {
	case res.ExitCode == 3:
		return problem(MCPStartup, text)
	case res.ExitCode == 4:
		return problem(AgentMissing, text)
	case unsupportedRe.MatchString(text):
		return problem(Unsupported, text)
	case signedOutRe.MatchString(text):
		return problem(NotSignedIn, text)
	case networkRe.MatchString(text):
		return problem(Unreachable, text)
	}
	return problem(Failed, text)
}
