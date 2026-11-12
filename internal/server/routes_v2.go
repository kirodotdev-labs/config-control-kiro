package server

import "net/http"

// v2Routes are the endpoints that exist only for Kiro CLI 2.x: deleting 2.x
// chats with kiro-cli's --delete-session, and Kiro's upgrade of 2.x agent
// configs to V3 (preview, apply, restore, whole scope).
func v2Routes(h Handlers, route func(string, http.HandlerFunc)) {
	route("POST /api/sessions/delete", h.Sessions.Delete)
	route("POST /api/agents/upgrade-all", h.Agent.UpgradeScope)
	route("POST /api/agents/{name}/upgrade/preview", h.Agent.PreviewUpgrade)
	route("POST /api/agents/{name}/upgrade", h.Agent.ApplyUpgrade)
	route("POST /api/agents/{name}/restore", h.Agent.RestoreBackup)
}
