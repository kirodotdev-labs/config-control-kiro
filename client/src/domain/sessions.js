/**
 * @fileoverview Pure helpers for the Chats & usage view: formatting credits
 * and times, naming folders after Workspaces, filtering chats, and advice
 * that links an agent's usage back to its configuration.
 */

/** Context use, in percent, above which a chat counts as nearly full. */
export const FULL_CONTEXT = 80;

/** @returns {string} e.g. "0.42", "8.5", "1,204". */
export function formatCredits(n) {
  if (n == null || Number.isNaN(n)) return '—';
  if (n === 0) return '0';
  if (n < 1) return n.toFixed(2);
  if (n < 100) return n.toFixed(1).replace(/\.0$/, '');
  return Math.round(n).toLocaleString('en-US');
}

/** @returns {string} e.g. "just now", "5 min ago", "3 h ago", "2 days ago", "4 Mar". */
export function timeAgo(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, (now - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 14) return `${Math.floor(s / 86400)} day${s < 172800 ? '' : 's'} ago`;
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: s > 86400 * 300 ? 'numeric' : undefined });
}

const norm = (p) => (p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

/** Whether path is root or inside it (case-insensitive, either slash). */
const isInside = (path, root) => !!root && (norm(path) === norm(root) || norm(path).startsWith(`${norm(root)}/`));

/**
 * Names a chat's folder: the Workspace it belongs to, else the folder's last part.
 * @param {string} folder
 * @param {{name: string, path: string}[]} workspaces
 * @returns {{label: string, workspace: boolean}}
 */
export function folderLabel(folder, workspaces = []) {
  const ws = workspaces
    .filter((w) => isInside(folder, w.path))
    .sort((a, b) => b.path.length - a.path.length)[0];
  if (ws) return { label: norm(folder) === norm(ws.path) ? ws.name : `${ws.name}/${folder.slice(ws.path.length).replace(/^[\\/]+/, '')}`, workspace: true };
  const parts = (folder || '').split(/[\\/]/).filter(Boolean);
  return { label: parts.length ? parts[parts.length - 1] : folder || '?', workspace: false };
}

/** Kiro's built-in default agent, as it appears in chat files. */
export const DEFAULT_AGENT = 'kiro_default';
export const agentLabel = (name) => (!name || name === DEFAULT_AGENT ? 'Default agent' : name);

/** Engine filter values, as Kiro reports each chat's engine. */
export const ENGINES = [
  { id: 'v3', label: 'V3' }, { id: 'v2', label: '2.x' }, { id: 'classic', label: 'Classic' },
];

/**
 * Counts for the filter chips. Subagent chats count under their parent.
 * Empty chats are counted apart: the chips count either the chats with
 * messages or, with emptyOnly, the empty ones.
 * @returns {{all: number, running: number, full: number, bookmarked: number, branches: number, subagents: number, empty: number, engines: Object<string, number>}}
 *   bookmarked: bookmarked in Kiro's /sessions; branches: tangents and rewinds.
 */
export function chatCounts(sessions, { emptyOnly = false } = {}) {
  const top = sessions.filter((s) => !s.parentId);
  const visible = top.filter((s) => !!s.empty === emptyOnly);
  const engines = {};
  visible.forEach((s) => { engines[s.engine] = (engines[s.engine] || 0) + 1; });
  return {
    all: visible.length,
    running: visible.filter((s) => s.running).length,
    full: visible.filter((s) => (s.contextPct ?? 0) >= FULL_CONTEXT).length,
    bookmarked: visible.filter((s) => s.bookmarked).length,
    branches: visible.filter((s) => s.kind).length,
    subagents: sessions.length - top.length,
    empty: top.filter((s) => s.empty).length,
    engines,
  };
}

/** A chat's tags from this app and from Kiro's /sessions, without repeats. */
const allTags = (s) => [...new Set([...(s.tags || []), ...(s.kiroTags || [])])];

/** Every tag in use, most used first: [{tag, count}]. */
export function tagCounts(sessions) {
  const counts = new Map();
  sessions.forEach((s) => (s.tags || []).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Mirrors the server: "#Client X" -> "client-x"; '' when unusable. */
export function normalizeTag(t) {
  return (t || '').trim().replace(/^#+/, '').trim().toLowerCase()
    .split(/\s+/).join('-').replace(/[^a-z0-9._-]+/g, '').replace(/^[-.]+|[-.]+$/g, '').slice(0, 40);
}

/**
 * Filters chats for the list. A query word starting with # matches that tag
 * exactly; other words match title, folder, agent, model, id and tags.
 * @param {Object[]} sessions
 * @param {{query?: string, show?: 'all'|'running'|'full'|'bookmarked'|'branches', agent?: string, folder?: string,
 *   subagents?: boolean, engine?: string, tag?: string, emptyOnly?: boolean}} f
 *   emptyOnly shows only empty chats; otherwise empty chats are hidden.
 */
export function filterChats(sessions, {
  query = '', show = 'all', agent = '', folder = '', subagents = false, engine = '', tag = '', emptyOnly = false,
} = {}) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const tagWords = words.filter((w) => w.startsWith('#')).map(normalizeTag).filter(Boolean);
  const plain = words.filter((w) => !w.startsWith('#'));
  return sessions.filter((s) => {
    const tags = allTags(s);
    const text = `${s.title} ${s.folder} ${s.agent || ''} ${s.model || ''} ${s.id} ${tags.join(' ')}`.toLowerCase();
    return (subagents || !s.parentId)
      && !!s.empty === emptyOnly
      && (show !== 'running' || s.running)
      && (show !== 'full' || (s.contextPct ?? 0) >= FULL_CONTEXT)
      && (show !== 'bookmarked' || s.bookmarked)
      && (show !== 'branches' || !!s.kind)
      && (!agent || (s.agent || DEFAULT_AGENT) === agent)
      && (!folder || isInside(s.folder, folder))
      && (!engine || s.engine === engine)
      && (!tag || tags.includes(tag))
      && tagWords.every((t) => tags.includes(t))
      && plain.every((w) => text.includes(w));
  });
}

/** Subagent chats by the chat that started them: Map<parentId, chat[]>, oldest first. */
export function childrenByParent(sessions) {
  const ids = new Set(sessions.map((s) => s.id));
  const map = new Map();
  sessions.filter((s) => s.parentId && ids.has(s.parentId)).forEach((s) => {
    if (!map.has(s.parentId)) map.set(s.parentId, []);
    map.get(s.parentId).push(s);
  });
  map.forEach((list) => list.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)));
  return map;
}

/**
 * Orders chats for display with each subagent chat right under the chat
 * that started it. Children of expanded parents (or all, with allChildren)
 * are inserted under them; a child whose parent isn't shown keeps its place.
 * @param {Object[]} shown filtered chats, newest first (may include children)
 * @param {Map<string, Object[]>} children from childrenByParent
 * @param {{allChildren?: boolean, expanded?: Set<string>}} opts
 * @returns {{chat: Object, depth: number}[]}
 */
export function nestChats(shown, children, { allChildren = false, expanded = new Set() } = {}) {
  const shownIds = new Set(shown.map((s) => s.id));
  const out = [];
  const placed = new Set();
  const add = (chat, depth) => {
    if (placed.has(chat.id)) return;
    placed.add(chat.id);
    out.push({ chat, depth });
    if (allChildren || expanded.has(chat.id)) (children.get(chat.id) || []).forEach((c) => add(c, depth + 1));
  };
  shown.forEach((s) => {
    if (s.parentId && shownIds.has(s.parentId)) return;
    add(s, 0);
  });
  return out;
}

/** Only chats that are subagent chats or started some, for the Subagent chats view. */
export const withSubagentLinks = (shown, children) => shown.filter((s) => s.parentId || children.has(s.id));

/** Why a chat can't be deleted from the app, or '' when it can. */
export function deleteBlocker(chat) {
  if (chat.running) return 'This chat is open in a terminal. Quit it first.';
  return '';
}

/** V3 chats are deleted in Kiro's own session dashboard; kiro-cli's --delete-session covers only 2.x chats. */
export const deletedInKiro = (chat) => chat.engine === 'v3';

/**
 * Suggestions that turn an agent's usage into a configuration change.
 * @param {Object} usage one entry of usage.byAgent
 * @returns {{id: string, text: string, where: 'model'|'settings'}[]}
 */
export function agentAdvice(usage) {
  if (!usage || !usage.chats) return [];
  const out = [];
  if (usage.mainRate >= 2 && usage.credits >= 50) {
    out.push({
      id: 'model', where: 'model',
      text: `Most of its credits go to ${usage.mainModel}, which costs ${usage.mainRate}x. If its work is routine, a 1x model (or "auto") uses about ${Math.round((1 - 1 / usage.mainRate) * 100)}% fewer credits per turn.`,
    });
  }
  if (usage.fullChats > 0 && usage.fullChats * 3 >= usage.chats) {
    out.push({
      id: 'context', where: 'settings',
      text: `${usage.fullChats} of its ${usage.chats} chats went above ${FULL_CONTEXT}% of the context window. Long chats re-send more each turn; starting a fresh chat per task, or the compaction settings, keep them smaller.`,
    });
  }
  return out;
}

/** Scales daily credits to bar heights in percent of the busiest day. */
export function barHeights(daily) {
  const max = Math.max(0, ...daily.map((d) => d.credits));
  return daily.map((d) => (max ? Math.round((d.credits / max) * 100) : 0));
}
