/**
 * @fileoverview Which card of the agent form edits which top-level key of the
 * spec, so the form and the JSON pane can point at each other, and what to
 * say about a key no card edits.
 */

/** The spec fields each section edits. Order matters: the first section listing a key owns it. */
export const SECTION_FIELDS = {
  v2: ['allowedTools', 'toolAliases', 'toolsSettings', 'keyboardShortcut'], // 2.x
  identity: ['description', 'prompt', 'name'],
  model: ['model', 'effortLevel'],
  tools: ['tools', 'excludedTools'],
  mcp: ['mcpServers', 'includeMcpJson'],
  permissions: ['permissions'],
  resources: ['resources'],
  powers: ['includePowers'],
  knowledge: ['resources'],
  hooks: ['hooks'],
  subagents: ['tools', 'permissions'],
  welcome: ['welcomeMessage'],
};

/** 2.x keys that stay in an upgraded agent's file, and what V3 uses instead. */
const V2_KEY_NOTES = {
  allowedTools: 'a Kiro CLI 2.x setting ("trust these tools"). In V3, allow rules in the Permissions card replace it.',
  toolAliases: 'a Kiro CLI 2.x setting. V3 has no tool aliases; use the tools\' own names.',
  toolsSettings: 'a Kiro CLI 2.x setting. In V3, sub-agents are set in the Sub-agents card and tool limits in Permissions.',
  keyboardShortcut: 'a Kiro CLI 2.x setting, not used by V3.',
};

/** Keys Kiro accepts that no card edits (they stay in the JSON). */
const JSON_ONLY = { kiroUpgrade: 'written by Kiro\'s agent upgrade; leave it.', $schema: 'the JSON schema reference.', includeSystemPrompt: 'not shown here; edit it in the JSON.' };

/**
 * The section that edits key, among the sections present.
 * @param {string} key
 * @param {string[]} present section ids rendered.
 * @returns {string} the section id, or '' for a key no card edits.
 */
export function sectionForKey(key, present) {
  return Object.keys(SECTION_FIELDS).find((s) => present.includes(s) && SECTION_FIELDS[s].includes(key)) || '';
}

/**
 * Keys of spec that no rendered card edits, each with where it belongs.
 * @param {Object} spec
 * @param {string[]} present section ids rendered.
 * @returns {{key: string, note: string}[]}
 */
export function uneditedKeys(spec, present) {
  return Object.keys(spec).filter((k) => !sectionForKey(k, present)).map((key) => ({
    key,
    note: V2_KEY_NOTES[key] || JSON_ONLY[key] || 'not a setting this app knows. Edit it in the JSON.',
  }));
}
