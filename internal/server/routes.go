package server

import (
	"net/http"

	"kiromanager/internal/agent"
	"kiromanager/internal/codeintel"
	"kiromanager/internal/fileexplorer"
	"kiromanager/internal/kirocli"
	"kiromanager/internal/launcher"
	"kiromanager/internal/mcp"
	"kiromanager/internal/memory"
	"kiromanager/internal/permissions"
	"kiromanager/internal/sandbox"
	"kiromanager/internal/sessions"
	"kiromanager/internal/shared/utils"
	"kiromanager/internal/skills"
	"kiromanager/internal/system"
	"kiromanager/internal/update"
	"kiromanager/internal/workflows"
)

// Handlers groups every feature handler the API exposes.
type Handlers struct {
	System       *system.Handler
	MCP          *mcp.Handler
	Agent        *agent.Handler
	FileExplorer *fileexplorer.Handler
	Permissions  *permissions.Handler
	Skills       *skills.Handler
	Workflows    *workflows.Handler
	Sandbox      *sandbox.Handler
	Launcher     *launcher.Handler
	Kiro         *kirocli.Handler
	Powers       *kirocli.PowersHandler
	Sessions     *sessions.Handler
	Memory       *memory.Handler
	CodeIntel    *codeintel.Handler
	// Update is the self-updater; main sets it, since it needs the port and session.
	Update *update.Handler
}

// NewHandlers constructs every feature service and its HTTP handler.
func NewHandlers(kiro *system.KiroService, logger *utils.Logger) Handlers {
	cli := kirocli.NewService()
	mcpService := mcp.NewMCPService(kiro, logger)
	return Handlers{
		System:       system.NewHandler(kiro),
		MCP:          mcp.NewHandler(mcpService),
		Agent:        agent.NewHandler(agent.NewAgentService(kiro, logger, cli.Runner, mcpService)),
		FileExplorer: fileexplorer.NewHandler(fileexplorer.NewFileExplorerService(logger, kiro.IsWSL(), kiro.DeletableRoots)),
		Permissions:  permissions.NewHandler(permissions.NewService(kiro, logger)),
		Skills:       skills.NewHandler(skills.NewService(kiro, logger, nil)),
		Workflows:    workflows.NewHandler(workflows.NewService(kiro)),
		Sandbox:      sandbox.NewHandler(sandbox.NewService(kiro, logger)),
		Launcher:     launcher.NewHandler(launcher.NewService(logger, kiro.IsWSL())),
		Kiro:         kirocli.NewHandler(cli),
		Powers:       kirocli.NewPowersHandler(cli, kiro.GlobalConfigPath),
		Sessions:     sessions.NewHandler(sessions.NewService(cli.Runner, kiro.GlobalConfigPath, cli.RateOf)),
		Memory:       memory.NewHandler(memory.NewService(kiro), memory.NewEditor(kiro, cli.Runner)),
		CodeIntel:    codeintel.NewHandler(codeintel.NewService(kiro)),
	}
}

// apiRoutes returns the /api route table. Each route is METHOD + path; the
// standard library mux answers 405 for wrong methods and 404 for unknown paths.
func apiRoutes(h Handlers) *http.ServeMux {
	m := http.NewServeMux()
	route := func(pattern string, fn http.HandlerFunc) { m.HandleFunc(pattern, fn) }

	route("GET /api/system/info", h.System.GetSystemInfo)
	route("GET /api/system/surfaces", h.System.GetSurfaces)
	route("GET /api/kiro/status", h.Kiro.GetStatus)
	route("GET /api/kiro/models", h.Kiro.GetModels)
	route("GET /api/kiro/settings", h.Kiro.GetSettingsCatalog)
	route("GET /api/kiro/agents", h.Kiro.GetBuiltinAgents)
	route("GET /api/kiro/plan", h.Kiro.GetPlan)
	route("GET /api/sessions", h.Sessions.Overview)
	route("GET /api/sessions/running", h.Sessions.Running)
	route("PUT /api/sessions/{id}/tags", h.Sessions.SetTags)
	route("POST /api/sessions/tags/rename", h.Sessions.RenameTag)
	route("GET /api/powers", h.Powers.List)
	route("POST /api/powers/install", h.Powers.Install)
	route("POST /api/powers/uninstall", h.Powers.Uninstall)
	route("GET /api/powers/installed/{name}", h.Powers.Installed)
	route("GET /api/powers/source", h.Powers.Source)
	route("GET /api/powers/sources", h.Powers.Sources)
	route("POST /api/powers/install-github", h.Powers.InstallGitHub)

	route("GET /api/workspace/context", h.System.GetWorkspaceContext)
	route("POST /api/workspace/context", h.System.SetWorkspaceContext)
	route("POST /api/workspace/add", h.System.AddWorkspace)
	route("POST /api/workspace/remove", h.System.RemoveWorkspace)

	route("GET /api/mcp/config", h.MCP.GetMCPConfig)
	route("POST /api/mcp/config", h.MCP.SaveMCPConfig)
	route("POST /api/mcp/tools/agent", h.MCP.GetAgentMCPTools)

	route("GET /api/agents", h.Agent.GetAgents)
	route("POST /api/agents", h.Agent.CreateAgent)
	route("GET /api/agents/all-names", h.Agent.GetAllAgentNames)
	route("GET /api/agents/{name}", h.Agent.GetAgent)
	route("PUT /api/agents/{name}", h.Agent.UpdateAgent)
	route("DELETE /api/agents/{name}", h.Agent.DeleteAgent)
	route("POST /api/knowledge/estimate", h.Agent.EstimateKnowledge)
	route("GET /api/relations", h.Agent.GetRelations)
	route("POST /api/agents/{name}/measure", h.Agent.MeasureServers)
	route("GET /api/agents/{name}/server-tools", h.Agent.GetServerTools)

	route("GET /api/permissions", h.Permissions.GetPermissions)
	route("GET /api/permissions/meta", h.Permissions.GetMeta)
	route("GET /api/skills", h.Skills.ListSkills)
	route("GET /api/skills/{name}", h.Skills.GetSkill)
	route("POST /api/skills/import", h.Skills.ImportSkill)
	route("GET /api/workflows/runs", h.Workflows.ListRuns)
	route("GET /api/workflows/runs/{id}", h.Workflows.GetRun)

	route("GET /api/memories", h.Memory.GetMemories)
	route("GET /api/codeintel", h.CodeIntel.GetInfo)
	if h.Update != nil {
		route("GET /api/update", h.Update.Get)
		route("POST /api/update/check", h.Update.Check)
		route("POST /api/update/apply", h.Update.Apply)
		route("POST /api/update/settings", h.Update.Settings)
	}
	route("POST /api/memories", h.Memory.CreateMemory)
	route("PUT /api/memories/{id}", h.Memory.UpdateMemory)
	route("DELETE /api/memories/{id}", h.Memory.DeleteMemory)
	route("GET /api/sandbox", h.Sandbox.GetSandbox)
	route("POST /api/sandbox", h.Sandbox.SaveSandbox)

	route("GET /api/fileexplorer/browse", h.FileExplorer.Browse)
	route("GET /api/fileexplorer/read", h.FileExplorer.ReadFile)
	route("POST /api/fileexplorer/file", h.FileExplorer.CreateFile)
	route("DELETE /api/fileexplorer/file", h.FileExplorer.DeleteFile)
	route("POST /api/fileexplorer/copy", h.FileExplorer.CopyFile)
	route("POST /api/fileexplorer/resolve-path", h.FileExplorer.ResolvePath)

	route("POST /api/launcher/launch", h.Launcher.Launch)
	v2Routes(h, route) // 2.x: remove with V2 support
	return m
}
