package system

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode/utf16"

	"kiromanager/internal/shared/utils"
)

// KiroTokens estimates the tokens text adds to the context the way Kiro's
// context breakdown does: its length in UTF-16 code units (JavaScript's
// string length) divided by 4, rounded up.
func KiroTokens(text string) int {
	n := len(utf16.Encode([]rune(text)))
	return (n + 3) / 4
}

// FileTokens is KiroTokens of a file's text; 0 when it can't be read.
func FileTokens(path string) int {
	data, err := os.ReadFile(path)
	if err != nil {
		return 0
	}
	return KiroTokens(string(data))
}

// MaxMCPToolID is Kiro's limit on a generated MCP tool id.
const MaxMCPToolID = 64

var (
	toolIDSpace = regexp.MustCompile(`[\s-]`)
	toolIDOther = regexp.MustCompile(`[^a-zA-Z0-9_]`)
)

// MCPToolID is the id Kiro gives an MCP tool: mcp_<server>_<tool>, lower-cased,
// limited to letters, digits and _, at most MaxMCPToolID characters. Kiro adds
// _1, _2, … when two tools of a session get the same id.
func MCPToolID(server, tool string) string {
	id := "mcp_" + strings.ToLower(toolIDOther.ReplaceAllString(toolIDSpace.ReplaceAllString(server+"_"+tool, "_"), ""))
	if len(id) > MaxMCPToolID {
		id = id[:MaxMCPToolID]
	}
	return id
}

// MCPLaunch is what decides which tools a server offers: how it is started
// or reached. Sizes measured for one launch don't apply to another.
type MCPLaunch struct {
	Command string            `json:"command,omitempty"`
	Args    []string          `json:"args,omitempty"`
	URL     string            `json:"url,omitempty"`
	Env     map[string]string `json:"env,omitempty"`
	Headers map[string]string `json:"headers,omitempty"`
}

// Key identifies a launch: equal launches give equal keys.
func (l MCPLaunch) Key() string {
	data, _ := json.Marshal(l) // map keys are sorted
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:12])
}

// key identifies a server by name and launch in the size store.
func (l MCPLaunch) key(name string) string {
	data, _ := json.Marshal(l)
	sum := sha256.Sum256(append([]byte(name+"\x00"), data...))
	return hex.EncodeToString(sum[:12])
}

// MCPSize is the measured size of a server's tool definitions, per tool name.
type MCPSize struct {
	Tools map[string]int `json:"tools"`
}

// Sent adds up the tools for which send reports true, and counts them.
func (s MCPSize) Sent(send func(tool string) bool) (tokens, count int) {
	for name, t := range s.Tools {
		if send(name) {
			tokens += t
			count++
		}
	}
	return tokens, count
}

// MCPSizes remembers measured MCP server sizes in <global>/kiroui/mcp-sizes.json,
// so the navigator can show them without starting servers. It also keeps,
// in memory only, why a server recently failed to answer, so it isn't
// started again on every visit.
type MCPSizes struct {
	path   string
	mu     sync.Mutex
	failed map[string]failure
}

// failure is a recent failed measurement.
type failure struct {
	reason string
	at     time.Time
}

// RetryAfter is how long a failed server is left alone before it is measured
// again automatically. Listing its tools in MCP servers always tries again.
const RetryAfter = 10 * time.Minute

// MCPSizes returns the store of measured MCP server sizes.
func (s *KiroService) MCPSizes() *MCPSizes { return s.mcpSizes }

func newMCPSizes(globalConfig string) *MCPSizes {
	return &MCPSizes{path: filepath.Join(globalConfig, "kiroui", "mcp-sizes.json"), failed: map[string]failure{}}
}

func (m *MCPSizes) load() map[string]MCPSize {
	out := map[string]MCPSize{}
	if data, err := os.ReadFile(m.path); err == nil {
		_ = json.Unmarshal(data, &out)
	}
	return out
}

// Lookup returns the measured size of the named server for this launch.
func (m *MCPSizes) Lookup(name string, launch MCPLaunch) (MCPSize, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	size, ok := m.load()[launch.key(name)]
	return size, ok
}

// Failure returns why the server failed to answer in the last RetryAfter, or "".
func (m *MCPSizes) Failure(name string, launch MCPLaunch) string {
	m.mu.Lock()
	defer m.mu.Unlock()
	f, ok := m.failed[launch.key(name)]
	if !ok || time.Since(f.at) > RetryAfter {
		return ""
	}
	return f.reason
}

// RecordFailure remembers that the server couldn't be measured, and why.
func (m *MCPSizes) RecordFailure(name string, launch MCPLaunch, reason string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.failed[launch.key(name)] = failure{reason: reason, at: time.Now()}
}

// Record stores a measured size and forgets any failure. Failing to save
// only means it is measured again.
func (m *MCPSizes) Record(name string, launch MCPLaunch, size MCPSize) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.failed, launch.key(name))
	all := m.load()
	all[launch.key(name)] = size
	data, err := json.MarshalIndent(all, "", "  ")
	if err != nil {
		return err
	}
	return utils.WriteFileAtomic(m.path, data)
}
