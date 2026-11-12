/**
 * @fileoverview A steering file's front matter: when Kiro loads it.
 * inclusion: always (the default) | fileMatch (with fileMatchPattern, one glob
 * or a list) | manual (#name or /name in a chat) | auto (name and description,
 * matched against the request). Only the lines the form edits change; every
 * other line of the front matter and the body are kept exactly.
 * Source: https://kiro.dev/docs/steering/ ("Inclusion modes").
 */

export const INCLUSIONS = [
  { value: 'always', label: 'Always included', hint: 'Loaded into every chat. Best for workspace-wide standards, technology preferences, security policies and coding conventions.' },
  { value: 'fileMatch', label: 'Conditional inclusion', hint: 'Loaded only when Kiro works on files that match a pattern. Best for domain-specific standards: component patterns, API design rules, testing approaches, deployment procedures.' },
  { value: 'auto', label: 'Auto inclusion', hint: 'Loaded when your request matches the description, like a skill. Best for context-heavy guidance that should only load when relevant.' },
  { value: 'manual', label: 'Manual inclusion', hint: 'Loaded when you type #name in a chat, or pick /name. Best for troubleshooting guides, migration procedures and documentation needed occasionally.' },
];

/** The docs' common fileMatchPattern globs, with what each covers. */
export const COMMON_PATTERNS = [
  ['*.tsx', 'React components and JSX files'],
  ['app/api/**/*', 'API routes and backend logic'],
  ['**/*.test.*', 'Test files and testing utilities'],
  ['src/components/**/*', 'Component-specific guidelines'],
  ['*.md', 'Documentation files'],
  ['**/*.ts', 'TypeScript files'],
  ['**/*.py', 'Python files'],
  ['**/*.go', 'Go files'],
];

const KEYS = ['inclusion', 'fileMatchPattern', 'name', 'description'];
const unquote = (v) => v.trim().replace(/^(["'])(.*)\1$/, '$2');
/** Quotes a value when YAML would read it as something else. */
const quote = (v) => (/^[\w./@-][\w ./@*-]*$/.test(v) && !/^(true|false|null|yes|no|on|off|~)$/i.test(v) ? v : JSON.stringify(v));

/**
 * Splits a steering file into its front matter fields and the rest.
 * @param {string} text
 * @returns {{fields: {inclusion: string, fileMatchPattern: string[], name: string, description: string}, lines: string[]|null, body: string}}
 *   lines: the raw front matter lines (null when the file has none).
 */
export function parseFrontMatter(text) {
  const fields = { inclusion: 'always', fileMatchPattern: [], name: '', description: '' };
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return { fields, lines: null, body: text };
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const kv = /^([A-Za-z]+):\s*(.*)$/.exec(lines[i]);
    if (!kv || !KEYS.includes(kv[1])) continue;
    const [, key, raw] = kv;
    if (key === 'fileMatchPattern') {
      if (raw.trim().startsWith('[')) {
        fields.fileMatchPattern = raw.trim().slice(1, -1).split(',').map(unquote).filter(Boolean);
      } else if (raw.trim()) {
        fields.fileMatchPattern = [unquote(raw)];
      } else {
        for (let j = i + 1; j < lines.length && /^\s+-\s/.test(lines[j]); j += 1) fields.fileMatchPattern.push(unquote(lines[j].replace(/^\s+-\s/, '')));
      }
    } else {
      fields[key] = unquote(raw);
    }
  }
  return { fields, lines, body: text.slice(m[0].length) };
}

/**
 * The file with one front matter field set. An empty value (or inclusion
 * "always") removes the key; a front matter left empty is removed.
 * @param {string} text
 * @param {'inclusion'|'fileMatchPattern'|'name'|'description'} key
 * @param {string|string[]} value
 */
export function setFrontMatter(text, key, value) {
  const { lines, body } = parseFrontMatter(text);
  const kept = [];
  const src = lines || [];
  for (let i = 0; i < src.length; i += 1) {
    if (new RegExp(`^${key}:`).test(src[i])) {
      while (i + 1 < src.length && /^\s+-\s/.test(src[i + 1])) i += 1; // a block list under the key
      continue;
    }
    kept.push(src[i]);
  }
  const empty = Array.isArray(value) ? !value.length : !value || (key === 'inclusion' && value === 'always');
  if (!empty) {
    let line;
    if (!Array.isArray(value)) line = `${key}: ${quote(value)}`;
    else line = value.length === 1 ? `${key}: ${JSON.stringify(value[0])}` : `${key}: [${value.map((v) => JSON.stringify(v)).join(', ')}]`;
    const at = KEYS.indexOf(key);
    const pos = kept.findIndex((l) => { const k = /^([A-Za-z]+):/.exec(l)?.[1]; return k && KEYS.includes(k) && KEYS.indexOf(k) > at; });
    kept.splice(pos === -1 ? kept.length : pos, 0, line);
  }
  if (!kept.some((l) => l.trim())) return body;
  return `---\n${kept.join('\n')}\n---\n${body}`;
}

/** @returns {string} what's missing for the chosen inclusion, or ''. */
export function frontMatterError({ inclusion, fileMatchPattern, name, description }) {
  if (!INCLUSIONS.some((i) => i.value === inclusion)) return `Kiro doesn't know inclusion "${inclusion}"`;
  if (inclusion === 'fileMatch' && !fileMatchPattern.length) return 'Add at least one file pattern';
  if (inclusion === 'auto' && (!name || !description)) return 'Auto inclusion needs a name and a description';
  return '';
}
