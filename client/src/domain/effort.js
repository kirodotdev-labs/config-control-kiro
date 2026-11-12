/**
 * @fileoverview Per-model reasoning effort saved in chat.modelDefaults
 * (kiro.dev/docs/models/effort). Claude models use output_config.effort,
 * GPT models reasoning.effort; other fields in an entry are kept.
 */

export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];

/** The field a model's effort lives in, per Kiro's documented schemas. */
export const effortField = (modelId) => (/^gpt-/i.test(modelId) ? 'reasoning' : 'output_config');

/** Whether Kiro documents reasoning effort for this model family. */
export const supportsEffort = (modelId) => /^(claude-|gpt-)/i.test(modelId || '');

/** The saved effort for a model, or ''. */
export function effortOf(defaults, modelId) {
  const entry = defaults?.[modelId];
  if (!entry || typeof entry !== 'object') return '';
  return entry.output_config?.effort || entry.reasoning?.effort || '';
}

/**
 * Sets (or clears, with '') one model's effort, keeping every other field.
 * Returns undefined when nothing is left, so the setting can be removed.
 */
export function withEffort(defaults, modelId, level) {
  const all = { ...(defaults || {}) };
  const entry = { ...(all[modelId] || {}) };
  const field = entry.reasoning && !entry.output_config ? 'reasoning' : effortField(modelId);
  const inner = { ...(entry[field] || {}) };
  if (level) inner.effort = level; else delete inner.effort;
  if (Object.keys(inner).length) entry[field] = inner; else delete entry[field];
  if (Object.keys(entry).length) all[modelId] = entry; else delete all[modelId];
  return Object.keys(all).length ? all : undefined;
}
