package kirocli

import (
	"context"
	"net/http"
	"regexp"
	"strings"
	"sync"

	"kiromanager/internal/shared/utils"
)

// BuiltinAgent is an agent that ships with Kiro CLI (kiro.dev/docs/custom-agents/built-in).
type BuiltinAgent struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Default     bool   `json:"default"` // the agent new chats start with
}

// BuiltinAgents is what this kiro-cli ships, or why it couldn't be read.
type BuiltinAgents struct {
	Agents  []BuiltinAgent `json:"agents"`
	Default string         `json:"default,omitempty"` // current default agent, built-in or not
	Problem *Problem       `json:"problem,omitempty"`
}

var (
	ansiRe      = regexp.MustCompile(`\x1b\[[0-9;]*[A-Za-z]`)
	agentLineRe = regexp.MustCompile(`^([* ]) (\S+)\s+(\(Built-in\)|Global|Workspace|Local)\s*(.*)$`)
	contLineRe  = regexp.MustCompile(`^\s{20,}(\S.*)$`)
)

type builtinCache struct {
	mu     sync.Mutex
	cached *BuiltinAgents
}

// parseAgentList reads `kiro-cli agent list` (text only; kiro-cli has no
// JSON form). Each agent is a "  name   Source   description" line; a "*"
// marks the default; long descriptions wrap onto indented lines.
func parseAgentList(out string) BuiltinAgents {
	res := BuiltinAgents{Agents: []BuiltinAgent{}}
	var cur *BuiltinAgent
	for _, raw := range strings.Split(ansiRe.ReplaceAllString(out, ""), "\n") {
		line := strings.TrimRight(raw, " \r")
		if m := agentLineRe.FindStringSubmatch(line); m != nil {
			cur = nil
			if m[1] == "*" {
				res.Default = m[2]
			}
			if m[3] == "(Built-in)" {
				res.Agents = append(res.Agents, BuiltinAgent{Name: m[2], Description: strings.TrimSpace(m[4]), Default: m[1] == "*"})
				cur = &res.Agents[len(res.Agents)-1]
			}
			continue
		}
		if m := contLineRe.FindStringSubmatch(line); m != nil && cur != nil {
			cur.Description = strings.TrimSpace(cur.Description + " " + m[1])
			continue
		}
		cur = nil
	}
	return res
}

// BuiltinAgents lists the agents kiro-cli ships with. The list only changes
// with a kiro-cli update, so a successful answer is kept for the session.
func (s *Service) BuiltinAgents(refresh bool) BuiltinAgents {
	s.builtins.mu.Lock()
	defer s.builtins.mu.Unlock()
	if s.builtins.cached != nil && !refresh {
		return *s.builtins.cached
	}
	res, p := s.Runner.Run(context.Background(), quickTimeout, "agent", "list")
	if p != nil {
		return BuiltinAgents{Agents: []BuiltinAgent{}, Problem: p}
	}
	list := parseAgentList(string(res.Stdout) + "\n" + string(res.Stderr))
	if len(list.Agents) == 0 {
		return BuiltinAgents{Agents: []BuiltinAgent{}, Problem: problem(Unsupported, "no built-in agents found in kiro-cli agent list")}
	}
	s.builtins.cached = &list
	return list
}

// GetBuiltinAgents handles GET /kiro/agents (?refresh=1).
func (h *Handler) GetBuiltinAgents(w http.ResponseWriter, r *http.Request) {
	utils.RespondJSON(w, http.StatusOK, h.service.BuiltinAgents(r.URL.Query().Get("refresh") == "1"))
}
