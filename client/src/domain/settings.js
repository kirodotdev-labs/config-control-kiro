/**
 * @fileoverview Helpers for the Kiro CLI settings form. Setting metadata
 * (type, choices, default, range) comes from the server, parsed from
 * `kiro-cli settings list --all`.
 */
import { versionAtLeast } from './version.js';

/**
 * Settings Kiro reads only from Global: a Workspace value has no effect.
 * Sources: kiro.dev/docs/reference/settings ("global-only") and /memory.
 */
export const GLOBAL_ONLY = new Set(['chat.agentEngine', 'chat.uiMode', 'chat.terminalTitle', 'memory.mode', 'memory.reflection']);

/** Order of groups in the form; anything else follows, Advanced last. */
const GROUP_ORDER = ['Chat', 'Keybindings', 'MCP', 'Knowledge', 'Tool search', 'Compaction', 'Hooks', 'Cleanup', 'Voice'];

/**
 * Groups settings for display, filtered by a search query and, optionally,
 * to those set in this file.
 * @returns {{name: string, settings: Object[]}[]}
 */
export function groupSettings(settings, { query = '', onlySet = false, values = {} } = {}) {
  const q = query.trim().toLowerCase();
  const groups = new Map();
  settings
    .filter((s) => !q || s.key.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
    .filter((s) => !onlySet || s.key in values)
    .forEach((s) => {
      if (!groups.has(s.group)) groups.set(s.group, []);
      groups.get(s.group).push(s);
    });
  const rank = (g) => (g === 'Advanced' ? 999 : GROUP_ORDER.includes(g) ? GROUP_ORDER.indexOf(g) : 500);
  return [...groups].map(([name, list]) => ({ name, settings: list })).sort((a, b) => rank(a.name) - rank(b.name));
}

/**
 * Checks a value against a setting's type, choices and range.
 * @returns {string} an error message, or '' when the value is acceptable.
 */
export function settingError(setting, value) {
  if (value === undefined) return '';
  switch (setting.type) {
    case 'boolean':
      return typeof value === 'boolean' ? '' : 'Must be on or off (true or false)';
    case 'number':
      if (typeof value !== 'number' || Number.isNaN(value)) return 'Must be a number';
      if (setting.min != null && value < setting.min) return `Must be at least ${setting.min}`;
      if (setting.max != null && value > setting.max) return `Must be at most ${setting.max}`;
      return '';
    case 'char':
      return typeof value === 'string' && value.length === 1 ? '' : 'Must be a single character';
    case 'array':
      return Array.isArray(value) ? '' : 'Must be a list';
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value) ? '' : 'Must be a JSON object';
    default:
      if (typeof value !== 'string') return 'Must be text';
      if (setting.choices?.length && !setting.choices.some((c) => c.value === value)) {
        return `Must be one of: ${setting.choices.map((c) => c.value).join(', ')}`;
      }
      return '';
  }
}

/** Every problem in a settings file, keyed by setting. Unknown keys are not errors. */
export function settingsErrors(catalog, values) {
  const out = {};
  catalog.forEach((s) => {
    const e = settingError(s, values[s.key]);
    if (e) out[s.key] = e;
  });
  return out;
}

/** Shows a stored value briefly, e.g. for "Global: on". */
export function describeValue(value) {
  if (value === undefined) return '';
  if (value === true) return 'on';
  if (value === false) return 'off';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * The engine a plain interactive kiro-cli chat starts with: the Global
 * chat.agentEngine (a Workspace can't override it), else Kiro's default, which
 * is V3 from Kiro CLI 3.0 and 2.x before it.
 * @param {Object} globalValues Global cli.json.
 * @param {string|undefined} cliVersion the installed Kiro CLI.
 */
export function effectiveEngine(globalValues, cliVersion) {
  const saved = globalValues?.['chat.agentEngine'];
  if (typeof saved === 'string' && saved) return saved;
  return versionAtLeast(cliVersion, '3.0.0') ? 'v3' : 'v2';
}
