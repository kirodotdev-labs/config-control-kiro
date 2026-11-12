/**
 * @fileoverview A power's plugin.json, the Agent Plugins manifest
 * (kiro.dev/docs/powers/create): the required fields, their rules, and a new
 * power's starting files.
 */
import YAML from 'yaml';
import { isObject, parseJson } from './json.js';

const PLUGIN_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
const MCP_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+(-[\w.]+)?$/;

/**
 * What Kiro would reject or ignore in a manifest, in the docs' words.
 * @param {Object} m the parsed manifest.
 * @param {'plugin.json'|'POWER.md'} [format] POWER.md (the original format) needs only name, description and keywords.
 * @returns {{field: string, message: string}[]}
 */
export function manifestProblems(m, format = 'plugin.json') {
  const out = [];
  const add = (field, message) => out.push({ field, message });
  if (!isObject(m)) return [{ field: '', message: `${format} must hold an object` }];
  const plugin = format === 'plugin.json';
  if (plugin && m.$schema !== PLUGIN_SCHEMA) add('$schema', `$schema should be ${PLUGIN_SCHEMA}`);
  if (!m.name) add('name', 'Name is required');
  else if (!KEBAB.test(m.name)) add('name', 'Name: kebab-case, lowercase letters, numbers and hyphens');
  if (plugin && !m.version) add('version', 'Version is required, e.g. 1.0.0');
  else if (m.version && !SEMVER.test(m.version)) add('version', 'Version: semantic, like 1.0.0');
  if (!m.description) add('description', 'Description is required');
  if (plugin && (!isObject(m.author) || !m.author.name)) add('author', 'Author name is required');
  if (!Array.isArray(m.keywords) || !m.keywords.filter((k) => typeof k === 'string' && k.trim()).length) {
    add('keywords', 'Keywords are required: Kiro loads the power when a request mentions one');
  }
  return out;
}

/** The files a new power starts with: plugin.json, an empty mcp.json and one skill. */
export function newPowerFiles(name, author) {
  return {
    'plugin.json': `${JSON.stringify({
      $schema: PLUGIN_SCHEMA, name, version: '0.1.0', description: '', author: { name: author || '' }, keywords: [],
    }, null, 2)}\n`,
    'mcp.json': `${JSON.stringify({ $schema: MCP_SCHEMA, mcpServers: {} }, null, 2)}\n`,
    'skills/getting-started/SKILL.md': `---\nname: getting-started\ndescription: \n---\n\n## Steps\n\n1. \n`,
  };
}

/** Advice on keywords, from the docs: terms people actually say. '' when fine. */
export function keywordAdvice(keywords) {
  const k = (keywords || []).filter(Boolean);
  if (!k.length) return '';
  if (k.length < 3) return 'Add a few more: the words people use when they need this tool, e.g. its name, what it does, the service it talks to.';
  if (k.some((w) => w.length < 3)) return 'Very short keywords match too often and load the power when it isn\'t needed.';
  return '';
}

/** The author's name from either format (an object in plugin.json, text in POWER.md). */
export const authorName = (m) => (isObject(m?.author) ? m.author.name || '' : typeof m?.author === 'string' ? m.author : '');

/** The author value to store for a name, in the manifest's format. */
export const withAuthor = (m, format, name) => (format === 'plugin.json' ? { ...(isObject(m.author) ? m.author : {}), name } : name || undefined);

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * Reads a manifest file into its fields: plugin.json as JSON, POWER.md's YAML front matter.
 * @returns {{value: Object|null, error: string}}
 */
export function readManifest(text, format) {
  if (format === 'plugin.json') {
    const { value, error } = parseJson(text || '{}');
    if (error) return { value: null, error: `plugin.json isn't valid JSON: ${error}` };
    return isObject(value) ? { value, error: '' } : { value: null, error: 'plugin.json must be a JSON object' };
  }
  const m = FENCE.exec(text || '');
  if (!m) return { value: null, error: 'POWER.md needs front matter: --- name, description, keywords --- at the top' };
  const doc = YAML.parseDocument(m[1]);
  const value = doc.errors.length ? null : doc.toJS();
  return isObject(value) ? { value, error: '' } : { value: null, error: "POWER.md's front matter isn't valid YAML" };
}

/** Writes the fields back into the manifest file, keeping POWER.md's instructions and any other keys. */
export function writeManifest(text, format, value) {
  if (format === 'plugin.json') return `${JSON.stringify(value, null, 2)}\n`;
  const m = FENCE.exec(text || '');
  const doc = YAML.parseDocument(m ? m[1] : '{}');
  if (doc.errors.length || !YAML.isMap(doc.contents)) return text;
  const before = doc.toJS() || {};
  Object.keys(before).forEach((k) => { if (!(k in value)) doc.delete(k); });
  Object.entries(value).forEach(([k, v]) => {
    if (JSON.stringify(before[k]) === JSON.stringify(v)) return;
    const old = doc.get(k, true);
    const node = doc.createNode(v);
    if (YAML.isSeq(old) && YAML.isSeq(node)) { // keep ["a", "b"] as ["a", "b"]
      node.flow = old.flow;
      const quote = YAML.isScalar(old.items[0]) ? old.items[0].type : undefined;
      node.items.forEach((i) => { if (quote && YAML.isScalar(i)) i.type = quote; });
    }
    if (YAML.isScalar(old) && YAML.isScalar(node)) node.type = old.type; // keep "quoted" as quoted
    doc.set(k, node);
  });
  const body = m ? text.slice(m[0].length) : `\n${text || ''}`;
  return `---\n${doc.toString({ lineWidth: 0 }).trimEnd()}\n---\n${body}`;
}

/** A new skill inside a power. */
export const newPowerSkill = (name) => `---\nname: ${name}\ndescription: \n---\n\n## Steps\n\n1. \n`;

/**
 * Sorts a power's files into where Kiro reads them (Kiro's PowersManager):
 * plugin.json powers have dev.kiro/INSTRUCTIONS.md, dev.kiro/steering/*.md and
 * skills/<name>/ (SKILL.md plus its scripts, references and assets); POWER.md
 * powers have POWER.md and steering/*.md. Every other file is kept in other,
 * with why Kiro doesn't read it, so nothing in the folder is hidden.
 * @param {{manifest: {format: string}, files: {rel: string}[], skills: string[], steering: string[], instructions: string}} power
 * @returns {{skillFiles: Object<string, string[]>, other: {rel: string, why: string}[]}}
 */
export function powerLayout(power) {
  const plugin = power.manifest.format === 'plugin.json';
  const skills = new Set(plugin ? power.skills : []);
  const known = new Set([power.manifest.format, 'mcp.json', power.instructions, ...power.steering]);
  const skillFiles = Object.fromEntries([...skills].map((s) => [s, []]));
  const other = [];
  power.files.forEach(({ rel }) => {
    if (known.has(rel)) return;
    const sk = /^skills\/([^/]+)\/(.+)$/.exec(rel);
    if (sk && skills.has(sk[1])) {
      if (sk[2] !== 'SKILL.md') skillFiles[sk[1]].push(rel);
      return;
    }
    other.push({ rel, why: whyUnread(rel, plugin) });
  });
  return { skillFiles, other };
}

function whyUnread(rel, plugin) {
  if (plugin && rel === 'POWER.md') return 'This power has plugin.json, so Kiro reads that and ignores POWER.md.';
  if (rel.startsWith('skills/')) return plugin ? 'Not inside a skill: a skill folder needs a SKILL.md.' : 'Kiro ignores skills in POWER.md powers; skills need the plugin.json format.';
  if (/^(dev\.kiro\/)?steering\//.test(rel)) {
    const where = plugin ? 'dev.kiro/steering/' : 'steering/';
    return rel.startsWith(where) ? `Kiro reads only .md files directly in ${where}.` : `This power's steering goes in ${where}, so Kiro doesn't read this one.`;
  }
  if (rel.startsWith('dev.kiro/')) return plugin ? 'Kiro reads dev.kiro/INSTRUCTIONS.md and dev.kiro/steering/ only.' : 'dev.kiro/ is for plugin.json powers; this power uses POWER.md.';
  return 'Kept with the power; Kiro doesn\'t read it on its own (a skill or the instructions can point to it).';
}
