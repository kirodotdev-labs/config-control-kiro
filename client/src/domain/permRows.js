/**
 * @fileoverview Kiro's capability and effect wording, pattern suggestions and
 * the agent's own capabilities for the permission rule cards (permissions.yaml and an agent's
 * permissions block).
 * Source: https://kiro.dev/docs/permissions/ and /custom-agents/configuration-reference/
 */
import { grantsBuiltin } from './kiroTools.js';
import { subagentMode } from './subagents.js';
import { stringList } from './json.js';

/** Rule effects, described as Kiro's docs do. */
export const EFFECT_LABELS = [
  { effect: 'allow', label: 'proceed silently' },
  { effect: 'ask', label: 'prompt you' },
  { effect: 'deny', label: 'block always' },
  { effect: 'evaluate', label: 'Kiro judges' },
];

/** Capabilities in Kiro's order, with what each covers and what Match is tested against. */
export const CAPABILITIES = [
  { cap: 'fs_read', label: 'read files', patterns: 'File paths: ** crosses folders, * stays in one' },
  { cap: 'fs_write', label: 'write files', patterns: 'File paths: ** crosses folders, * stays in one' },
  { cap: 'shell', label: 'run commands', patterns: 'Commands: * is any text, e.g. git *' },
  { cap: 'web_fetch', label: 'fetch URLs', patterns: 'URLs: * is any text' },
  { cap: 'web_search', label: 'search the web', patterns: 'Search terms: * is any text' },
  { cap: 'mcp', label: 'MCP tools', patterns: 'server/tool, e.g. git/* for every tool of git' },
  { cap: 'subagent', label: 'start sub-agents', patterns: 'Agent names' },
  { cap: 'skill', label: 'load skills and steering on demand', patterns: 'Skill names' },
  { cap: 'power', label: 'use tools of installed Powers', patterns: 'power/server/tool' },
  { cap: 'context', label: 'add files and memories to the chat context', patterns: 'File paths' },
  { cap: 'diagnostics', label: 'read code diagnostics (errors, warnings)', patterns: 'File paths' },
  { cap: 'sandbox_network', label: 'sandbox network hosts', patterns: 'Hosts, e.g. *.github.com (first matching rule decides)' },
  { cap: 'filesystem', label: 'fs_read + fs_write', patterns: 'File paths: ** crosses folders, * stays in one' },
  { cap: 'builtin', label: 'all built-in tools', patterns: 'Patterns' },
  { cap: 'all', label: 'every capability except sandbox_network', patterns: 'Patterns' },
];

/** Meta-capabilities: each covers several capabilities at once, whatever the agent's tools. */
export const META_CAPABILITIES = ['all', 'builtin', 'filesystem'];

const ANY = (tools, ...ids) => ids.some((id) => grantsBuiltin(tools, id));

/**
 * The capabilities this agent can use: from its tools, or included without
 * being in tools (MCP servers, skills, Powers, sub-agents).
 * @param {Object} spec the agent
 * @param {{hasServers?: boolean, skillsAvailable?: boolean}} ctx
 * @returns {Set<string>}
 */
export function agentCapabilities(spec, { hasServers = false, skillsAvailable = false } = {}) {
  const tools = stringList(spec.tools);
  const out = new Set();
  if (ANY(tools, 'read', 'read_file', 'list_directory', 'file_search', 'grep_search', 'code', 'introspect')) out.add('fs_read');
  if (ANY(tools, 'write', 'fs_write', 'fs_append', 'str_replace', 'delete_file')) out.add('fs_write');
  if (ANY(tools, 'shell', 'execute_bash', 'execute_pwsh')) out.add('shell');
  if (ANY(tools, 'web', 'web_fetch')) out.add('web_fetch');
  if (ANY(tools, 'web', 'remote_web_search', 'web_search')) out.add('web_search');
  if (hasServers) out.add('mcp');
  if (subagentMode(tools).mode !== 'none') out.add('subagent');
  const resources = Array.isArray(spec.resources) ? spec.resources : [];
  if (skillsAvailable || resources.some((r) => typeof r === 'string' && r.startsWith('skill://'))) out.add('skill');
  if (spec.includePowers === true) out.add('power');
  return out;
}

/** Common patterns per capability, with what each means. */
const COMMON = {
  shell: [['git *', 'every git command'], ['git status', 'only git status'], ['npm *', 'every npm command'], ['npm test', 'only npm test'],
    ['npx *', 'every npx command'], ['make *', 'every make target'], ['ls *', 'list folders'], ['cat *', 'print files'],
    ['rm -rf *', 'recursive delete'], ['sudo *', 'anything as administrator'], ['curl *', 'web requests from the shell'], ['docker *', 'every docker command']],
  fs_read: [['./**', 'everything in this folder'], ['src/**', 'the src folder'], ['**/.env', 'any .env file'], ['**/.env.*', 'any .env.something file'],
    ['secrets/**', 'the secrets folder'], ['**/*.pem', 'any .pem key file'], ['~/.ssh/**', 'your SSH keys'], ['~/.aws/**', 'your AWS credentials']],
  fs_write: [['src/**', 'the src folder'], ['tests/**', 'the tests folder'], ['docs/**', 'the docs folder'], ['**/*.md', 'any Markdown file'],
    ['**/.env', 'any .env file'], ['**/*.pem', 'any .pem key file'], ['**/*.lock', 'lock files'], ['.git/**', 'the git folder']],
  web_fetch: [['https://docs.aws.amazon.com/*', 'AWS documentation'], ['https://kiro.dev/*', 'Kiro documentation'], ['https://github.com/*', 'GitHub'],
    ['https://*.amazonaws.com/*', 'AWS endpoints']],
  sandbox_network: [['*.github.com', 'GitHub hosts'], ['registry.npmjs.org', 'npm packages'], ['pypi.org', 'Python packages']],
  context: [['./**', 'everything in this folder'], ['src/**', 'the src folder'], ['**/.env', 'any .env file']],
  diagnostics: [['./**', 'everything in this folder'], ['src/**', 'the src folder']],
};

/**
 * Suggestions for one capability's Match and Except: common patterns, and
 * names from the setup (MCP servers and their tools, agents, skills).
 * @param {string} cap
 * @param {{servers?: Object<string, string[]>, agents?: string[], skills?: string[]}} known
 * @returns {{options: string[], describe: (o: string) => string}}
 */
export function suggestionsFor(cap, { servers = {}, agents = [], skills = [] } = {}) {
  const meaning = new Map();
  (COMMON[cap] || []).forEach(([p, d]) => meaning.set(p, d));
  if (cap === 'mcp') {
    Object.entries(servers).forEach(([s, tools]) => {
      meaning.set(`${s}/*`, `every tool of ${s}`);
      (tools || []).forEach((t) => meaning.set(`${s}/${t}`, `one tool of ${s}`));
    });
  }
  if (cap === 'subagent') agents.forEach((a) => meaning.set(a, 'an agent'));
  if (cap === 'skill') skills.forEach((k) => meaning.set(k, 'a skill'));
  return { options: [...meaning.keys()], describe: (o) => meaning.get(o) || '' };
}
