/**
 * @fileoverview permissions.yaml as text and as the form's {policies, rules}.
 * The text is the document: form edits rewrite only the policies and rules
 * keys, so comments and any other keys in the file survive. Kiro's effects and
 * the rule shape are checked here so a bad edit never reaches the file.
 */
import YAML from 'yaml';
import { EFFECT_COLOR } from './permissions.js';

const EFFECTS = Object.keys(EFFECT_COLOR);
const strings = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === 'string') : []);

/**
 * Reads the form's view of a permissions.yaml text.
 * @param {string} text
 * @returns {{policies: string[], rules: Object[], error: string}} error is '' when the text is usable.
 */
export function readPermissions(text) {
  const empty = { policies: [], rules: [] };
  if (!text.trim()) return { ...empty, error: '' };
  const doc = YAML.parseDocument(text);
  if (doc.errors.length) return { ...empty, error: doc.errors[0].message.split('\n')[0] };
  const top = doc.toJS();
  if (top === null) return { ...empty, error: '' };
  if (typeof top !== 'object' || Array.isArray(top)) return { ...empty, error: 'permissions.yaml must be a mapping of keys to values' };
  const rawRules = top.rules === undefined || top.rules === null ? [] : top.rules;
  if (!Array.isArray(rawRules)) return { ...empty, error: 'rules must be a list' };
  const rules = [];
  for (const [i, r] of rawRules.entries()) {
    if (!r || typeof r !== 'object' || typeof r.capability !== 'string' || !r.capability.trim()) {
      return { ...empty, error: `rule ${i + 1}: capability is required` };
    }
    if (!EFFECTS.includes(r.effect)) return { ...empty, error: `rule ${i + 1}: effect must be one of ${EFFECTS.join(', ')}` };
    rules.push({ ...r, match: strings(r.match), exclude: strings(r.exclude) });
  }
  return { policies: strings(top.policies), rules, error: '' };
}

/**
 * Writes the form's policies and rules into a permissions.yaml text, keeping
 * everything else in it. Empty match/exclude lists and an empty policies key
 * are left out, as Kiro writes them.
 * @param {string} text the current file text (may be empty).
 * @param {{policies: string[], rules: Object[]}} form
 * @returns {string}
 */
export function writePermissions(text, { policies, rules }) {
  const doc = YAML.parseDocument(text.trim() ? text : '{}');
  if (doc.errors.length || !YAML.isMap(doc.contents)) return text;
  const items = rules.map((r) => {
    const out = { capability: r.capability };
    for (const k of Object.keys(r)) if (!['capability', 'match', 'exclude', 'effect'].includes(k)) out[k] = r[k];
    if (r.match?.length) out.match = r.match;
    if (r.exclude?.length) out.exclude = r.exclude;
    out.effect = r.effect;
    return out;
  });
  if (policies.length) doc.set('policies', policies); else doc.delete('policies');
  doc.set('rules', items);
  doc.contents.flow = false;
  return doc.toString({ lineWidth: 0 });
}
