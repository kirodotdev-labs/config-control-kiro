/**
 * @fileoverview Labels and search for Kiro's memories, as Kiro shows them:
 * a type (Preference, Fact) and a scope (Global or one repository).
 * Source: https://kiro.dev/docs/memory/
 */

/** Kiro's memory types, with the wording Kiro uses for them. */
export const MEMORY_TYPES = {
  USER_PREFERENCE: { label: 'Preference', hint: 'How you like Kiro to work.' },
  SEMANTIC: { label: 'Fact', hint: 'Something true about this repository.' },
};

/** @returns {{label: string, hint: string}} the type's label, or Other for one Kiro adds later. */
export const memoryType = (type) => MEMORY_TYPES[type] || { label: 'Other', hint: 'Not a preference or a fact.' };

/**
 * A scope as people read it: "Global", or the repository's owner/name.
 * @param {string} scope e.g. "Global", "repo:github/acme/shop".
 */
export function scopeLabel(scope) {
  if (!scope.startsWith('repo:')) return scope;
  const [provider, ...rest] = scope.slice(5).split('/');
  return provider === 'gitfarm' ? rest[rest.length - 1] : rest.join('/');
}

/** The Show filter: by type, or by where a memory applies. */
export const MEMORY_FILTERS = [
  { value: '', label: 'All memories' },
  { value: 'USER_PREFERENCE', label: 'Preferences' },
  { value: 'SEMANTIC', label: 'Facts' },
  { value: 'global', label: 'Global' },
  { value: 'repo', label: 'Repositories' },
];

/**
 * Memories whose title or summary contains every word of the query (any
 * case), optionally only of one type or location (see MEMORY_FILTERS).
 * @param {Object[]} memories
 * @param {string} query
 * @param {string} [only]
 */
export function filterMemories(memories, query, only = '') {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const kept = memories.filter((m) => !only
    || (only === 'global' ? m.scopes.includes('Global')
      : only === 'repo' ? m.scopes.some((s) => s.startsWith('repo:')) : m.type === only));
  if (!words.length) return kept;
  return kept.filter((m) => {
    const text = `${m.title} ${m.summary}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

/** Kiro's limits for a memory: a dash-slug title of at most 50 characters, a one-line summary of at most 200. */
const MAX_TITLE = 50;
const MAX_SUMMARY = 200;

/** A title typed as words, made into Kiro's dash-slug ("Seed DB before tests" -> "seed-db-before-tests"). */
export const titleSlug = (text) => text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, MAX_TITLE).replace(/-+$/, '');

/**
 * What Kiro would refuse in a memory, per field, in the same terms the app's server checks.
 * @param {{type: string, scope?: string, title: string, summary: string, content: string}} d
 * @returns {Object<string, string>} field -> problem; empty when Kiro would accept it.
 */
export function draftProblems(d, { create = true } = {}) {
  const out = {};
  if (!MEMORY_TYPES[d.type]) out.type = 'Choose a type';
  if (create && !d.scope) out.scope = 'Choose where it applies';
  if (!/^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/.test(d.title || '')) out.title = 'Letters, digits and hyphens, like seed-db-before-tests';
  else if (d.title.length > MAX_TITLE) out.title = `At most ${MAX_TITLE} characters`;
  if (!(d.summary || '').trim()) out.summary = 'One line: what it covers and when to use it';
  else if (/\n/.test(d.summary)) out.summary = 'One line only';
  else if (d.summary.length > MAX_SUMMARY) out.summary = `At most ${MAX_SUMMARY} characters`;
  if (!(d.content || '').trim()) out.content = 'Write what Kiro should remember';
  return out;
}

/**
 * Why memories can't be changed from the app right now, or '' when they can.
 * Changes go through Kiro (kiro-cli acp, Kiro CLI 2.36 or later), signed in,
 * with Access read & write.
 * @param {Object} status Kiro CLI status: installed, signedIn, version.
 * @param {string} mode memory.mode in Global settings ('' when not set).
 * @param {(v: string, min: string) => boolean} atLeast
 */
export function memoryEditBlocker(status, mode, atLeast) {
  if (!status) return 'Checking Kiro CLI…';
  if (!status.installed) return 'Kiro CLI isn\'t installed.';
  if (!atLeast(status.version, '2.36.0')) return `Changing memories from this app needs Kiro CLI 2.36 or later (you have ${status.version}).`;
  if (!status.signedIn) return 'Sign in to Kiro first: memories belong to your sign-in.';
  if (mode === 'disabled') return 'Memory Access is Off. Choose read & write above to add or change memories.';
  if (mode === 'read_only') return 'Memory Access is Read only. Choose read & write above to add or change memories.';
  return '';
}
