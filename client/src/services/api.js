/**
 * @fileoverview The only network module. One axios instance carries the
 * per-launch bearer token; every endpoint the app uses is a function here, so
 * components and hooks never build URLs or touch the transport.
 */
import axios from 'axios';

const http = axios.create({ baseURL: '/api', timeout: 30000 });

http.interceptors.request.use((config) => {
  const token = window.__CCKIRO_TOKEN__;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const data = (promise) => promise.then((res) => res.data);
const enc = encodeURIComponent;

/**
 * Extracts a user-facing message from a failed request ({error, code} bodies).
 * @param {unknown} err
 * @returns {string}
 */
export const apiErrorMessage = (err) => {
  const body = err?.response?.data;
  if (body?.error) return body.fix ? `${body.error} ${body.fix}` : body.error;
  return err?.message || 'Something went wrong';
};

/** Raw tool output attached to a failed request, if any (for "Copy details"). */
export const apiErrorDetail = (err) => err?.response?.data?.detail || '';

/** System info, configuration surfaces, models and the app update check. */
export const systemApi = {
  info: () => data(http.get('/system/info')),
  surfaces: () => data(http.get('/system/surfaces')),
};

/** The user's kiro-cli: health, models for their account, and its settings catalog. */
export const kiroApi = {
  status: (refresh = false) => data(http.get('/kiro/status', { params: refresh ? { refresh: 1 } : {} })),
  models: (refresh = false) => data(http.get('/kiro/models', { params: refresh ? { refresh: 1 } : {} })),
  settings: () => data(http.get('/kiro/settings')),
  builtinAgents: () => data(http.get('/kiro/agents')),
  plan: (refresh = false) => data(http.get('/kiro/plan', { params: refresh ? { refresh: 1 } : {}, timeout: 90000 })),
};

/** How many files an agent knowledge base would cover, before Kiro indexes it. */
export const knowledgeApi = {
  estimate: (folder, include, exclude) => data(http.post('/knowledge/estimate', { folder, include, exclude }, { timeout: 15000 })),
};

/** Kiro CLI chats and credit usage; folder limits them to one Workspace. */
export const sessionsApi = {
  overview: ({ refresh = false, folder = '' } = {}) => data(http.get('/sessions', {
    params: { ...(refresh ? { refresh: 1 } : {}), ...(folder ? { folder } : {}) }, timeout: 120000,
  })),
  running: () => data(http.get('/sessions/running')),
  setTags: (id, tags) => data(http.put(`/sessions/${encodeURIComponent(id)}/tags`, { tags })),
  renameTag: (from, to) => data(http.post('/sessions/tags/rename', { from, to })),
};

/** Kiro's Powers: list (installed + catalog), install by name or folder, uninstall. */
export const powersApi = {
  /** Installed powers and Kiro's catalog; refresh downloads the catalog again now. */
  list: (refresh = false) => data(http.get('/powers', { params: refresh ? { refresh: 1 } : {}, timeout: 30000 })),
  install: (target) => data(http.post('/powers/install', { target }, { timeout: 200000 })),
  uninstall: (target) => data(http.post('/powers/uninstall', { target }, { timeout: 200000 })),
  /** Downloads a power folder from a GitHub URL and installs it with kiro-cli. */
  installGitHub: (target) => data(http.post('/powers/install-github', { target }, { timeout: 200000 })),
  /** What is inside an installed power: { dir, manifest, servers, skills, steering, files, problems }. */
  installed: (name) => data(http.get(`/powers/installed/${enc(name)}`)),
  /** Your own power folders: { dir, powers: [PowerDetail] }. */
  sources: () => data(http.get('/powers/sources')),
  /** The same for a power folder you keep yourself. */
  source: (path) => data(http.get('/powers/source', { params: { path } })),
};

/** Active scope (Global or a Workspace) and the saved workspace list. */
export const workspaceApi = {
  context: () => data(http.get('/workspace/context')),
  setContext: (mode, path = '') => data(http.post('/workspace/context', { mode, path })),
  add: (path) => data(http.post('/workspace/add', { path })),
  remove: (path) => data(http.post('/workspace/remove', { path })),
};

/** Agent specs, addressed by id (the file name without extension). */
export const agentApi = {
  list: () => data(http.get('/agents')),
  /** Agent ids in the active scope plus Global (what a subagent may refer to). */
  allIds: () => data(http.get('/agents/all-names')),
  get: (id) => data(http.get(`/agents/${enc(id)}`)),
  create: (spec) => data(http.post('/agents', spec)),
  update: (id, spec) => data(http.put(`/agents/${enc(id)}`, spec)),
  remove: (id) => data(http.delete(`/agents/${enc(id)}`)),
  /** Lists the tools of the agent's MCP servers not measured yet: { measured, failed, skipped }. */
  measure: (id) => data(http.post(`/agents/${enc(id)}/measure`, null, { timeout: 60000 })),
  /** The measured tools of the agent's MCP servers, by server (never starts one): { [server]: string[] }. */
  serverTools: (id) => data(http.get(`/agents/${enc(id)}/server-tools`)),
};

/** mcp.json for the active scope, and live tool discovery. */
export const mcpApi = {
  config: () => data(http.get('/mcp/config')),
  saveConfig: (config) => data(http.post('/mcp/config', { config })),
  /** Lists tools for the given servers: { [name]: { tools, error? } }. */
  tools: (mcpServers) => data(http.post('/mcp/tools/agent', { mcpServers }, { timeout: 45000 })),
};

/** permissions.yaml rules for the active scope. */
export const permissionsApi = {
  get: () => data(http.get('/permissions')),
  meta: () => data(http.get('/permissions/meta')),
};

/** settings/sandbox.json for the active scope. */
/**
 * What Kiro remembers: { memories, repo, elsewhere, stores }. Changes go through
 * Kiro itself (its memory methods over kiro-cli acp) and answer the new list.
 */
/**
 * The self-updater: { current, latest, state, auto, reason, downloadURL, releasesURL, checked, updatedFrom }.
 * apply restarts the app into the downloaded version; the page reconnects by itself.
 */
export const updateApi = {
  status: () => data(http.get('/update')),
  check: () => data(http.post('/update/check', {}, { timeout: 120000 })),
  apply: () => data(http.post('/update/apply', {})),
  settings: (auto) => data(http.post('/update/settings', { auto })),
};

/** Code intelligence setup for the active Workspace: { detected: language ids, installed: {command: bool} }. */
export const codeIntelApi = {
  info: (commands) => data(http.get('/codeintel', { params: { commands: commands.join(',') } })),
};

export const memoryApi = {
  list: () => data(http.get('/memories')),
  create: (draft) => data(http.post('/memories', draft, { timeout: 60000 })),
  update: (id, draft) => data(http.put(`/memories/${encodeURIComponent(id)}`, draft, { timeout: 60000 })),
  remove: (id) => data(http.delete(`/memories/${encodeURIComponent(id)}`, { timeout: 60000 })),
};

export const sandboxApi = {
  get: () => data(http.get('/sandbox')),
  save: (config) => data(http.post('/sandbox', { config })),
};

/** Plain files by absolute path, directory browsing and path resolution. */
export const fileApi = {
  /** { content, exists }. optional: a missing file answers exists=false rather than an error. */
  read: (path, optional = false) => data(http.get('/fileexplorer/read', { params: optional ? { path, optional: 1 } : { path } })),
  save: (path, content, createOnly = false) => data(http.post('/fileexplorer/file', { path, content, createOnly })),
  /** Copies an existing file into a skill or power folder; an existing dest is replaced only with overwrite. */
  copy: (source, dest, overwrite = false) => data(http.post('/fileexplorer/copy', { source, dest, overwrite })),
  /** Deletes a file in hooks, steering, skills, prompts, workflows or specs, or a whole skill or spec folder. */
  remove: (path) => data(http.delete('/fileexplorer/file', { params: { path } })),
  browse: (path) => data(http.get('/fileexplorer/browse', { params: { path } })),
  /** Resolves a Linux, macOS or Windows path: { valid, exists, type, resolvedPath, parentPath, error }. */
  resolve: (path) => data(http.post('/fileexplorer/resolve-path', { path })),
};

/** Kiro's workflow runs in the active scope, read only: list, and one run with its plan and node states. */
export const workflowsApi = {
  runs: () => data(http.get('/workflows/runs')),
  run: (id) => data(http.get(`/workflows/runs/${enc(id)}`)),
};

/** Skills of the active scope: [{ name, dir, path, description, problems, files: [{rel, path, size}] }]. */
export const skillsApi = {
  list: () => data(http.get('/skills')),
  get: (name) => data(http.get(`/skills/${enc(name)}`)),
  /** Copies a skill folder in from a GitHub folder URL or a local folder path. */
  import: (source) => data(http.post('/skills/import', { source }, { timeout: 120000 })),
};

/** What a navigator item is connected to: { links: [{id, via, inherited}], other: [{label, path, via, note}] }. */
export const relationsApi = {
  get: (id) => data(http.get('/relations', { params: { id } })),
};

/** Opens a native terminal running a kiro-cli command in a directory. */
export const launcherApi = {
  launch: (directory, command) => data(http.post('/launcher/launch', { directory, command })),
};

/**
 * Endpoints that exist only for Kiro CLI 2.x (server/routes_v2.go): deleting
 * 2.x chats with kiro-cli --delete-session, and Kiro's upgrade of 2.x agent
 * configs to V3. Removed with V2 support.
 */
export const v2Api = {
  deleteChats: (ids, onlyEmpty = false) => data(http.post('/sessions/delete', { ids, onlyEmpty }, { timeout: 300000 })),
  /** Kiro's upgrade run on a copy: { before, after, changed, output, hash }. */
  previewUpgrade: (id) => data(http.post(`/agents/${enc(id)}/upgrade/preview`, null, { timeout: 120000 })),
  applyUpgrade: (id, hash) => data(http.post(`/agents/${enc(id)}/upgrade`, { hash }, { timeout: 120000 })),
  restore: (id) => data(http.post(`/agents/${enc(id)}/restore`)),
  /** Kiro's upgrade over every JSON agent in the scope: { output }. */
  upgradeAll: (dryRun) => data(http.post('/agents/upgrade-all', { dryRun }, { timeout: 120000 })),
};
