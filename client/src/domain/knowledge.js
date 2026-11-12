/**
 * @fileoverview Agent knowledge bases. They live in the agent's `resources`
 * as objects { type: "knowledgeBase", source: "file://<folder>", name?,
 * description?, indexType?: "best"|"fast", include?, exclude?, autoUpdate? }
 * (the field set of kiro-cli V3's schema), next to the loaded file:// and
 * skill:// entries. Unlike those, they're never loaded: Kiro indexes the
 * folder and the agent searches it with the built-in `knowledge` tool, which
 * the read/write/shell/web tags don't include (kiro.dev/docs/tools).
 */
import { isObject } from './json.js';
import { grantsBuiltin } from './kiroTools.js';

/** Kiro's built-in agent, used when chat.defaultAgent isn't set. */
const BUILTIN_DEFAULT_AGENT = 'kiro_default';

export const isKnowledgeBase = (r) => isObject(r) && r.type === 'knowledgeBase';

/** The folder from a file:// source. */
const folderOf = (source) => String(source || '').replace(/^file:\/\//, '');

/** Dialog values from an entry, or empty ones for a new knowledge base. */
export function formFromEntry(entry) {
  const e = entry || {};
  return {
    name: e.name || '', folder: folderOf(e.source), description: e.description || '',
    indexType: e.indexType === 'fast' ? 'fast' : 'best', autoUpdate: e.autoUpdate === true,
    include: Array.isArray(e.include) ? e.include : [], exclude: Array.isArray(e.exclude) ? e.exclude : [],
  };
}

/**
 * The entry to save. Only fields that differ from Kiro's defaults are
 * written; fields the dialog doesn't know (from a newer Kiro) are kept.
 */
export function entryFromForm(form, previous) {
  const out = { ...(isObject(previous) ? previous : {}) };
  ['name', 'description', 'indexType', 'autoUpdate', 'include', 'exclude'].forEach((k) => delete out[k]);
  out.type = 'knowledgeBase';
  out.source = `file://${form.folder.trim()}`;
  if (form.name.trim()) out.name = form.name.trim();
  if (form.description.trim()) out.description = form.description.trim();
  if (form.indexType === 'fast') out.indexType = 'fast';
  if (form.include.length) out.include = form.include;
  if (form.exclude.length) out.exclude = form.exclude;
  if (form.autoUpdate) out.autoUpdate = true;
  return out;
}

/** Problems that block saving: a name unique within the agent, and a folder. */
export function formErrors(form, others = []) {
  const errors = {};
  const name = form.name.trim();
  if (!name) errors.name = 'Give it a name, so you can tell knowledge bases apart.';
  else if (others.some((o) => (o.name || '').trim().toLowerCase() === name.toLowerCase())) {
    errors.name = 'This agent already has a knowledge base with that name.';
  }
  if (!form.folder.trim()) errors.folder = 'Choose the folder Kiro should index.';
  return errors;
}

/** One line describing an entry, e.g. "/docs · best · only **\/*.md". */
export function describeEntry(kb) {
  const parts = [folderOf(kb.source), kb.indexType === 'fast' ? 'fast' : 'best'];
  if (kb.autoUpdate) parts.push('re-indexes on start');
  if (kb.include?.length) parts.push(`only ${kb.include.join(', ')}`);
  if (kb.exclude?.length) parts.push(`skips ${kb.exclude.join(', ')}`);
  return parts.join(' · ');
}

/** Whether the agent's tools let it search knowledge bases. */
export const canSearchKnowledge = (tools) => grantsBuiltin(Array.isArray(tools) ? tools : [], 'knowledge');

/** The folder to count files in: a relative path is taken from the workspace root. */
export function absoluteFolder(folder, workspaceRoot) {
  const f = folder.trim();
  if (!f || /^([a-zA-Z]:[\\/]|[\\/]|~)/.test(f) || !workspaceRoot) return f;
  return `${workspaceRoot.replace(/[\\/]+$/, '')}/${f.replace(/^\.\//, '')}`;
}

/** "1.4 MB", "820 KB". */
export function formatBytes(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} KB`;
  return `${n} bytes`;
}

/**
 * The agent new chats start with, and where that comes from: a Workspace
 * chat.defaultAgent wins over Global; with neither it's Kiro's built-in.
 * @returns {{agent: string, from: 'workspace'|'global'|'kiro'}}
 */
export function effectiveDefaultAgent(globalValue, workspaceValue) {
  if (typeof workspaceValue === 'string' && workspaceValue) return { agent: workspaceValue, from: 'workspace' };
  if (typeof globalValue === 'string' && globalValue) return { agent: globalValue, from: 'global' };
  return { agent: BUILTIN_DEFAULT_AGENT, from: 'kiro' };
}

/**
 * Whether knowledge is on: a Workspace chat.enableKnowledge wins over
 * Global; with neither, Kiro V3 has it on (its default feature set).
 */
export function knowledgeEnabled(globalValue, workspaceValue) {
  if (typeof workspaceValue === 'boolean') return workspaceValue;
  if (typeof globalValue === 'boolean') return globalValue;
  return true;
}
