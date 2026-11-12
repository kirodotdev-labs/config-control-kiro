/**
 * @fileoverview Turns a relations response into what the navigator draws:
 * which rows are linked (and how), which groups must open to show them, and
 * which rows to dim, and the size dots for what each item adds to the agent's context.
 */

/**
 * @param {Object[]} nodes the scope's surface tree.
 * @param {string} selectedId
 * @param {{links: Object[], other: Object[]}|undefined} relations
 * @returns {{active: boolean, linked: Map<string, {via: string, inherited: boolean, unused: boolean, context?: Object}>, openGroups: Set<string>, other: Object[],
 *   selectedGroup: string|undefined}} selectedGroup is the group holding the selected row, which stands in for it while folded.
 */
export function relationView(nodes, selectedId, relations) {
  const linked = new Map((relations?.links || []).map((l) => [l.id, { via: l.via, inherited: !!l.inherited, unused: !!l.unused, context: l.context }]));
  const other = relations?.other || [];
  const wanted = new Set([selectedId, ...linked.keys()]);
  const openGroups = new Set();
  let selectedGroup;
  (nodes || []).forEach((group) => {
    const children = group.children || [];
    if (children.some((c) => wanted.has(c.id))) openGroups.add(group.id);
    if (children.some((c) => c.id === selectedId)) selectedGroup = group.id;
    children.forEach((c) => { // a skill's files sit one level deeper: open the group and the skill
      if ((c.children || []).some((f) => wanted.has(f.id))) { openGroups.add(group.id); openGroups.add(c.id); }
    });
  });
  return { active: linked.size + other.length > 0, linked, openGroups, other, selectedGroup };
}

/**
 * The relation state of one row.
 * @returns {'self'|'linked'|'inherited'|'unused'|'muted'|undefined} undefined when nothing is selected.
 *   unused: connected, but Kiro won't use it (a disabled or ungranted MCP server).
 */
export function rowRelation(view, id, selectedId) {
  if (!view.active) return undefined;
  if (id === selectedId) return 'self';
  if (id === view.selectedGroup) return undefined; // holds the selection: never dimmed
  const link = view.linked.get(id);
  if (!link) return 'muted';
  if (link.unused) return 'unused';
  return link.inherited ? 'inherited' : 'linked';
}

const MIN_R = 3;
const MAX_R = 8;
const count = (n) => n.toLocaleString('en-US');

function contextTitle(context, mcp) {
  if (context.unmeasured) {
    if (!context.problem) return 'Measuring: listing its tools now.';
    return context.problem.startsWith('Not measured') ? context.problem : `Couldn't list its tools, so its size isn't known: ${context.problem}`;
  }
  const tokens = count(context.tokens || 0);
  return mcp
    ? `Up to ${tokens} tokens with every message: the definitions of ${count(context.tools || 0)} tool${context.tools === 1 ? '' : 's'}. In V3 chats, Tool Search can send fewer.`
    : `${tokens} tokens with every message.`;
}

/**
 * The dot at the end of each relation line that adds to the selected agent's
 * context with every message, sized against the others: the dot's area grows
 * with its tokens, so the largest item has the largest dot. An MCP server not
 * measured yet gets a ring. Items that add nothing get no entry, and no dot.
 * @param {{id: string, context?: {tokens: number, tools?: number, unmeasured?: boolean}, mcp?: boolean}[]} targets
 * @returns {Map<string, {r: number, ring: boolean, title: string}>}
 */
export function contextDots(targets) {
  const sized = targets.filter((t) => t.context);
  const largest = Math.max(0, ...sized.filter((t) => !t.context.unmeasured).map((t) => t.context.tokens || 0));
  return new Map(sized.map((t) => {
    const ring = !!t.context.unmeasured;
    const share = largest ? (t.context.tokens || 0) / largest : 0;
    const r = ring ? (MIN_R + MAX_R) / 2 : MIN_R + (MAX_R - MIN_R) * Math.sqrt(share);
    return [t.id, { r, ring, title: contextTitle(t.context, t.mcp) }];
  }));
}
