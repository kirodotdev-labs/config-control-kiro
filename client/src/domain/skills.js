/**
 * @fileoverview A skill's SKILL.md front matter (kiro.dev/docs/skills,
 * agentskills.io): name (must match the folder), description (when Kiro uses
 * it), license, compatibility and metadata. The front matter is YAML between
 * --- fences at the very top of the file; the rest is the instructions.
 */
import YAML from 'yaml';

/** The front matter keys the form edits, in the order they're written. */
const SKILL_KEYS = ['name', 'description', 'license', 'compatibility', 'metadata'];

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * Splits SKILL.md into its front matter and the instructions.
 * @param {string} text
 * @returns {{fields: Object, body: string, hasFront: boolean, error: string}} fields: the five keys
 *   (metadata as an object of strings); error when the YAML can't be read.
 */
export function parseSkill(text) {
  const fields = { name: '', description: '', license: '', compatibility: '', metadata: {} };
  const m = FENCE.exec(text);
  if (!m) return { fields, body: text, hasFront: false, error: '' };
  const doc = YAML.parseDocument(m[1]);
  const top = doc.errors.length ? null : doc.toJS();
  if (!top || typeof top !== 'object' || Array.isArray(top)) {
    return { fields, body: text.slice(m[0].length), hasFront: true, error: 'The front matter is not valid YAML' };
  }
  for (const k of ['name', 'description', 'license', 'compatibility']) if (typeof top[k] === 'string') fields[k] = top[k];
  if (top.metadata && typeof top.metadata === 'object' && !Array.isArray(top.metadata)) {
    fields.metadata = Object.fromEntries(Object.entries(top.metadata).map(([k, v]) => [k, String(v)]));
  }
  return { fields, body: text.slice(m[0].length), hasFront: true, error: '' };
}

/**
 * SKILL.md with one front matter field changed. Other keys in the front
 * matter are kept; an empty value removes its key.
 * @param {string} text
 * @param {string} key one of SKILL_KEYS.
 * @param {string|Object} value
 * @returns {string}
 */
export function setSkillField(text, key, value) {
  const m = FENCE.exec(text);
  const doc = YAML.parseDocument(m ? m[1] : '{}');
  if (doc.errors.length || !YAML.isMap(doc.contents)) return text;
  const empty = typeof value === 'object' ? !Object.keys(value).length : !String(value).trim();
  if (empty) doc.delete(key); else doc.set(key, value);
  doc.contents.flow = false;
  // Keep Kiro's order for the known keys, then anything else as it was.
  const items = doc.contents.items;
  items.sort((a, b) => rank(String(a.key)) - rank(String(b.key)));
  const body = m ? text.slice(m[0].length) : text;
  if (!items.length) return body;
  return `---\n${doc.toString({ lineWidth: 0 }).trimEnd()}\n---\n${body}`;
}
const rank = (k) => { const i = SKILL_KEYS.indexOf(k); return i < 0 ? SKILL_KEYS.length : i; };

/** The specification's rule for a skill name (also its folder name). */
const NAME_RULE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * What stops Kiro using this skill, in the docs' words.
 * @param {Object} fields parsed front matter.
 * @param {string} folder the skill's folder name.
 * @returns {string[]}
 */
export function skillProblems(fields, folder) {
  const out = [];
  if (!fields.name) out.push('Name is required.');
  else if (fields.name !== folder) out.push(`Name must match the folder name, ${folder}.`);
  else if (!NAME_RULE.test(fields.name) || fields.name.length > 64) out.push('Name: lowercase letters, numbers and hyphens, at most 64 characters.');
  if (!fields.description.trim()) out.push("Description is required: Kiro matches it against your requests, so without it the skill never activates.");
  else if (fields.description.length > 1024) out.push('Description: at most 1024 characters.');
  return out;
}

/**
 * Advice on a description, from the docs' best practices. '' when it's fine.
 * @param {string} description
 */
export function descriptionAdvice(description) {
  const d = description.trim();
  if (!d) return '';
  if (d.length < 40) return 'Short descriptions activate badly. Say what it does and when to use it, e.g. "Review pull requests for security issues and test coverage. Use when reviewing PRs or preparing code for review."';
  if (!/\buse (it )?(when|for|to)\b/i.test(d)) return 'Add when to use it, e.g. "… Use when reviewing PRs." Kiro matches this against your requests.';
  return '';
}

/** The folders the specification gives a skill, with what goes in each. */
export const SKILL_FOLDERS = [
  { dir: 'scripts', label: 'Scripts', hint: 'Executable code Kiro can run: validation, file generation, API calls.' },
  { dir: 'references', label: 'References', hint: 'Documentation Kiro reads only when the instructions point to it.' },
  { dir: 'assets', label: 'Assets', hint: 'Templates and other files the instructions use.' },
];
