/**
 * @fileoverview MCP server config helpers shared by mcp.json and an agent's
 * inline mcpServers. Server entries are kept exactly as written; only the
 * fields the user edits change.
 * Source: https://kiro.dev/docs/mcp/configuration/
 */
import { isObject, parseJson, setField, stringList } from './json.js';

/** @returns {[string, Object][]} the [name, config] pairs of a servers map, in file order. */
export const serverEntries = (servers) =>
  Object.entries(isObject(servers) ? servers : {}).map(([name, cfg]) => [name, isObject(cfg) ? cfg : {}]);

/** @returns {'http'|'stdio'} how kiro-cli reaches the server. */
export const transportOf = (cfg) => (cfg.url ? 'http' : 'stdio');

/** @returns {string} a one-line description of how the server starts or where it lives. */
export function serverSummary(cfg) {
  if (cfg.url) return cfg.url;
  return [cfg.command, ...(Array.isArray(cfg.args) ? cfg.args : [])].filter(Boolean).join(' ');
}

/** @returns {Object} cfg with disabled set (or removed when enabled). */
export function setEnabled(cfg, enabled) {
  if (enabled) {
    const { disabled: _d, ...rest } = cfg;
    return rest;
  }
  return { ...cfg, disabled: true };
}

/**
 * Reads servers pasted from docs or another tool. Accepts a full mcp.json
 * ({mcpServers: {...}}), a bare servers map ({name: {...}}), or the inside of
 * one ("name": {...}), and tolerates trailing commas.
 * @param {string} text
 * @returns {{servers: Object|null, error: string}}
 */
export function parseServers(text) {
  const cleaned = text.trim().replace(/,\s*([}\]])/g, '$1').replace(/,\s*$/, '');
  if (!cleaned) return { servers: null, error: '' };
  let { value, error } = parseJson(cleaned);
  if (error) ({ value, error } = parseJson(`{${cleaned}}`));
  if (error) return { servers: null, error };
  const servers = isObject(value?.mcpServers) ? value.mcpServers : value;
  if (!isObject(servers) || !Object.keys(servers).length) {
    return { servers: null, error: 'Expected an object of servers, like {"name": {"command": "…"}}' };
  }
  const bad = Object.entries(servers).find(([, cfg]) => !isObject(cfg) || (!cfg.command && !cfg.url));
  if (bad) return { servers: null, error: `"${bad[0]}" needs a "command" (local) or a "url" (remote)` };
  return { servers, error: '' };
}

/** Rewrites local servers to start through wsl.exe, for Kiro running on Windows. */
export function toWsl(servers) {
  return Object.fromEntries(Object.entries(servers).map(([name, cfg]) => {
    if (!cfg.command || cfg.command === 'wsl.exe') return [name, cfg];
    return [name, { ...cfg, command: 'wsl.exe', args: ['-e', cfg.command, ...(cfg.args || [])] }];
  }));
}

/**
 * cfg with one field of its oauth block set; an empty value removes the
 * field, and an empty block is removed.
 * @param {Object} cfg
 * @param {'clientId'|'clientSecret'|'redirectUri'|'clientMetadataUrl'|'oauthScopes'} key
 * @param {any} value
 */
export function setOAuth(cfg, key, value) {
  const oauth = setField(isObject(cfg.oauth) ? cfg.oauth : {}, key, value);
  return setField(cfg, 'oauth', Object.keys(oauth).length ? oauth : undefined);
}

/**
 * Why Kiro would reject a redirect URI, or '' when it's fine (or empty).
 * Kiro accepts a full http URL, host:port or :port, on 127.0.0.1 or
 * localhost, with a port from 1 to 65535 and no query or fragment.
 * @param {string} uri
 */
export function redirectUriError(uri) {
  const v = (uri || '').trim();
  if (!v) return '';
  let url;
  try {
    url = new URL(v.includes('://') ? v : `http://${v.startsWith(':') ? `127.0.0.1${v}` : v}`);
  } catch {
    return 'Use a URL like http://localhost:7778/oauth/callback, or 127.0.0.1:7778, or :7778';
  }
  if (url.protocol !== 'http:') return 'The scheme must be http (Kiro answers the callback on this computer)';
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return 'The host must be 127.0.0.1 or localhost';
  if (!url.port) return 'Include a port, for example :7778';
  if (url.search || url.hash) return "A redirect URI can't have a query or fragment";
  return '';
}

/** @returns {boolean} whether every tool of the server runs without asking (autoApprove has "*"). */
export const approvesAll = (cfg) => stringList(cfg.autoApprove).includes('*');

/**
 * cfg with one tool added to or removed from autoApprove ("*" means every tool).
 * @param {Object} cfg
 * @param {string} tool
 * @param {boolean} on
 */
export function setAutoApprove(cfg, tool, on) {
  const list = stringList(cfg.autoApprove).filter((t) => t !== tool);
  return setField(cfg, 'autoApprove', on ? [...list, tool] : list);
}
