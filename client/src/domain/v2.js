/**
 * @fileoverview Kiro CLI 2.x formats that V3 ignores or only still accepts,
 * so the agent editor can recognise them and hand them to Kiro's upgrade.
 * Removed with V2 support. Sources: kiro.dev/docs/cli/v3/hooks-migration,
 * /custom-agents/configuration-reference (toolsSettings, 2.x hooks).
 */
import { isObject } from './json.js';
import { versionAtLeast } from './version.js';

/** CLI 2.x camelCase hook trigger spellings, which V3 still accepts. */
const V2_TRIGGERS = {
  agentSpawn: 'SessionStart', AgentSpawn: 'SessionStart', userPromptSubmit: 'UserPromptSubmit',
  preToolUse: 'PreToolUse', postToolUse: 'PostToolUse', stop: 'Stop',
};

/** @returns {string} the V3 trigger name for a 2.x spelling, or name unchanged. */
export const v3Trigger = (name) => V2_TRIGGERS[name] || name;

/** @returns {boolean} whether value is the CLI 2.x object form of agent hooks. */
export const isV2Hooks = (value) => isObject(value);

/** @returns {number} how many hooks the 2.x object form holds (0 for anything else). */
export const v2HookCount = (value) => (isObject(value)
  ? Object.values(value).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0) : 0);

/** Whether the spec still carries CLI 2.x sub-agent settings (toolsSettings.subagent). */
export const hasV2Subagents = (spec) => isObject(spec.toolsSettings?.subagent);

/**
 * Global chat.enableAutoAgentUpgrade: unset or true, a V3 chat (Kiro CLI 2.37
 * or later) upgrades 2.x agents by itself when it starts; false, never.
 * Source: kiro.dev/docs/cli/v3/upgrade-agent ("Automatic upgrade when V3 starts").
 * @param {Object} globalSettings Global cli.json
 * @param {string|undefined} cliVersion
 */
export function autoUpgrades(globalSettings, cliVersion) {
  return globalSettings?.['chat.enableAutoAgentUpgrade'] !== false && versionAtLeast(cliVersion, '2.37');
}

/**
 * What the Kiro CLI V3 card says about an agent, from Kiro's own verdict when
 * there is one, else from the agent's fields.
 * @param {{state: string, universal?: boolean, kiro?: string}} v3 the agent's readiness.
 * @param {boolean} auto whether Kiro upgrades it when a V3 chat starts.
 * @returns {{tone: 'success'|'info'|'warning'|'error', title: string, text: string}|null} null: nothing to say.
 */
export function v3Status(v3, auto) {
  const later = auto
    ? 'Kiro upgrades it by itself the next time a V3 chat starts, and keeps the original as a .bak file.'
    : "Kiro won't upgrade it by itself here (that needs Kiro CLI 2.37 or later, with chat.enableAutoAgentUpgrade not set to off), so it stays this way until you upgrade it.";
  if (v3.kiro === 'error') return { tone: 'error', title: "Kiro can't read this agent", text: 'Fix the file, then check again.' };
  if (v3.kiro === 'out-of-sync') {
    return {
      tone: 'warning', title: 'Out of sync',
      text: "Kiro upgraded this agent, then its V3 settings were edited. Kiro no longer updates them from the 2.x ones, so 2.x and V3 chats can behave differently. To rebuild the V3 settings from the 2.x ones, run /upgrade-agent in a V3 chat and choose Universal · Out of Sync. That replaces the edits; Kiro keeps the file as a .bak.",
    };
  }
  if (v3.state === 'upgrade' && v3.universal) {
    return { tone: 'info', title: 'Upgraded by Kiro, 2.x settings changed since', text: `Its V3 settings no longer match the 2.x ones. ${auto ? 'Kiro refreshes them the next time a V3 chat starts.' : 'Upgrade with Kiro to refresh them.'}` };
  }
  if (v3.universal) return { tone: 'success', title: 'Upgraded by Kiro', text: 'It works in Kiro CLI V3 and 2.x: Kiro added the V3 settings and kept the 2.x ones for 2.x chats.' };
  if (v3.state === 'blocked') return { tone: auto ? 'info' : 'error', title: 'A Kiro CLI 2.x agent', text: `V3 can't use its 2.x tool settings. ${later}${auto ? '' : ' Until then, a V3 chat starts the default agent instead.'}` };
  if (v3.state === 'upgrade') return { tone: auto ? 'info' : 'warning', title: 'Partly Kiro CLI 2.x', text: `V3 ignores the settings below. ${later}` };
  return null;
}

/** Fields Kiro's upgrade generates for V3; editing them makes an upgraded agent out of sync. */
const GENERATED_V3 = ['tools', 'permissions', 'hooks'];

/**
 * Whether saving `next` changes a field Kiro generated for an agent it upgraded.
 * @param {Object} saved the agent as last saved.
 * @param {Object} next the agent about to be saved.
 */
export const editsGeneratedV3 = (saved, next) =>
  GENERATED_V3.some((k) => JSON.stringify(saved?.[k]) !== JSON.stringify(next?.[k]));
