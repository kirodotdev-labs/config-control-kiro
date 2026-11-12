/**
 * @fileoverview What an agent sends with every prompt, before you type: the
 * relations of the agent (the same data the navigator draws) turned into a
 * breakdown by kind, a list biggest first, what is connected but not sent,
 * and suggestions that would send less. Counts are Kiro's own estimate.
 */

/** The kinds the breakdown groups items by, in display order. */
const CONTEXT_KINDS = [
  { id: 'mcp', label: 'MCP servers' },
  { id: 'steering', label: 'Steering' },
  { id: 'agentsmd', label: 'AGENTS.md' },
  { id: 'prompt', label: 'Prompt file' },
  { id: 'files', label: 'Resource files' },
];

const BIG = 5000;               // tokens: worth a suggestion
const TOOL_SEARCH_TOKENS = 50000; // Kiro's toolSearch.minTokens default
const TOOL_SEARCH_PCT = 5;        // Kiro's toolSearch.minPct default
const HEAVY_PCT = 25;           // share of the window used before you type

const fmt = (n) => n.toLocaleString('en-US');

function kindOf(item) {
  if (item.id?.startsWith('mcpserver:') || item.label?.startsWith('MCP server ')) return 'mcp';
  if (item.via === 'prompt') return 'prompt';
  if (item.id?.startsWith('agentsmd:')) return 'agentsmd';
  if (item.id?.startsWith('steering:') || item.label === 'Global steering and skills') return 'steering';
  return 'files';
}

const SOURCE = { 'mcp.json': 'from mcp.json, like the default agent', global: 'from Global mcp.json', agent: "this agent's own copy" };

/** Why a connected item isn't counted above, or '' when it isn't content at all. */
function notSentReason(item) {
  const via = item.via || '';
  if (kindOf(item) === 'mcp') {
    return via.includes('Turned off') ? "Turned off: Kiro doesn't start it." : "None of its tools reach this agent (Tools, excludedTools).";
  }
  if (via.startsWith('knowledge base')) return 'Knowledge base: searched when needed, not loaded.';
  if (via.includes('skill')) return 'Skill: loaded only when Kiro decides it is needed.';
  if (via === 'inherited: auto steering') return 'Auto steering: loaded when its description matches the task.';
  if (via === 'inherited: fileMatch steering') return 'File-match steering: loaded when matching files are in the chat.';
  if (via.startsWith('inherited') || via.startsWith('applies to every agent') || via === 'includeMcpJson') return '';
  if (item.note === 'relative to the folder Kiro starts in') return "Sent by Kiro, but not counted here: its path depends on the folder Kiro starts in.";
  return item.note ? `Not sent: ${item.note}.` : '';
}

/**
 * @param {{links: Object[], other: Object[]}|undefined} relations of `agent:<id>`.
 * @param {Map<string, string>} names navigator id -> display name.
 * @returns {{total: number, kinds: {id: string, label: string, tokens: number, count: number}[],
 *   items: Object[], notSent: {name: string, reason: string}[], unmeasured: number, mcpTokens: number}}
 *   items: {key, name, kind, tokens, via, inherited, ring, problem, tools, toolsTotal, source}, biggest first.
 */
export function agentContext(relations, names) {
  const all = [
    ...(relations?.links || []).map((l) => ({ ...l, key: l.id, name: names.get(l.id) || l.id })),
    ...(relations?.other || []).map((o, i) => ({ ...o, key: `other:${i}`, name: o.label.replace(/^MCP server /, '') })),
  ];
  const items = all.filter((i) => i.context).map((i) => ({
    key: i.key, name: i.name, kind: kindOf(i), via: i.via, inherited: !!i.inherited,
    tokens: i.context.tokens || 0, ring: !!i.context.unmeasured, problem: i.context.problem || '',
    tools: i.context.tools || 0, toolsTotal: i.context.toolsTotal || 0, source: SOURCE[i.context.from] || '',
  })).sort((a, b) => b.tokens - a.tokens || a.name.localeCompare(b.name));
  const notSent = all.filter((i) => !i.context).map((i) => ({ name: i.name, reason: notSentReason(i) })).filter((n) => n.reason);
  const kinds = CONTEXT_KINDS.map((k) => {
    const of = items.filter((i) => i.kind === k.id);
    return { ...k, tokens: of.reduce((s, i) => s + i.tokens, 0), count: of.length };
  }).filter((k) => k.count);
  return {
    total: items.reduce((s, i) => s + i.tokens, 0), kinds, items, notSent,
    unmeasured: items.filter((i) => i.ring).length,
    mcpTokens: kinds.find((k) => k.id === 'mcp')?.tokens || 0,
  };
}

/**
 * Changes that would send less with every prompt, from what is there.
 * @param {ReturnType<typeof agentContext>} ctx
 * @param {number} [window] the model's context window in tokens, when known.
 * @returns {{id: string, text: string}[]}
 */
export function contextSuggestions(ctx, window) {
  const out = [];
  const pct = (n) => (window ? (n / window) * 100 : 0);
  if (window && pct(ctx.total) >= HEAVY_PCT) {
    out.push({ id: 'heavy', text: `${Math.round(pct(ctx.total))}% of the context window is used before you type. Less room is left for the work, and chats reach compaction sooner.` });
  }
  ctx.items.filter((i) => !i.ring && i.tokens >= BIG).forEach((i) => {
    if (i.kind === 'mcp' && i.toolsTotal > 1 && i.tools === i.toolsTotal) {
      out.push({ id: `mcp:${i.key}`, text: `${i.name} sends all ${i.tools} of its tools (${fmt(i.tokens)} tokens). If this agent needs only some, list them in Tools, like @${i.name}/<tool>, to send less.` });
    } else if (i.kind === 'steering' && i.inherited) {
      out.push({ id: `steer:${i.key}`, text: `${i.name} (${fmt(i.tokens)} tokens) is always-on steering. Set inclusion: auto or fileMatch in its front matter so Kiro loads it only when it's relevant.` });
    } else if (i.kind === 'steering' || i.kind === 'files') {
      out.push({ id: `file:${i.key}`, text: `${i.name} (${fmt(i.tokens)} tokens) is listed in Context, so it's sent in full. If it's reference material, add its folder in Knowledge instead, so Kiro searches it.` });
    }
  });
  if (ctx.mcpTokens >= TOOL_SEARCH_TOKENS || (window && pct(ctx.mcpTokens) >= TOOL_SEARCH_PCT)) {
    out.push({ id: 'toolsearch', text: `MCP tool definitions are ${fmt(ctx.mcpTokens)} tokens. V3 chats use Tool Search by default, which sends only the tools a turn needs. In V2 chats, turn on toolSearch.enabled in Settings.` });
  }
  return out;
}

/** 46,210 → "46K", 3,214 → "3.2K", 840 → "840". */
export function shortTokens(n) {
  if (n < 1000) return String(n);
  return n < 10000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K` : `${Math.round(n / 1000)}K`;
}

/** Resource URIs for a scope's steering and skills (Workspace paths are relative to the project). */
export function scopeUris(isWorkspace) {
  const root = isWorkspace ? '.kiro' : '~/.kiro';
  return {
    allSteering: `file://${root}/steering/**/*.md`,
    allSkills: `skill://${root}/skills/**/SKILL.md`,
    steering: (name) => `file://${root}/steering/${name}`,
    skill: (name) => `skill://${root}/skills/${name}/SKILL.md`,
  };
}
