/**
 * @fileoverview Workflow recipes (kiro.dev/docs/workflows/authoring): read and
 * write them as JSON or YAML, check them against the documented rules, list
 * the template values a node may read, and edit the node tree.
 *
 * A node is addressed by its JSON path from the recipe root, e.g.
 * ['steps', 2, 'branches', 0]: sequence and repeat children live in `steps`,
 * parallel children in `branches`.
 */
import YAML from 'yaml';
import { isObject, parseJson } from './json.js';
import { RECIPE_TEMPLATES } from './workflowTemplates.js';

/** Agents Kiro ships for workflow steps (available while workflows are on). */
export const BUNDLED_AGENTS = [
  { id: 'wf-planner', role: 'Read-only investigation and planning; writes reports and plans' },
  { id: 'wf-coder', role: 'Implements changes, runs tests, commits' },
  { id: 'wf-design', role: 'Writes technical designs' },
  { id: 'wf-design-reviewer', role: 'Reviews a design against requirements' },
  { id: 'wf-review-aggregator', role: 'Merges several review reports into one' },
  { id: 'wf-pr-submitter', role: 'Opens or reuses a pull request and records its URL' },
  { id: 'wf-pr-responder', role: 'Responds to pull request feedback' },
  { id: 'wf-auto-researcher', role: 'Proposes, applies and measures one experiment per iteration' },
  { id: 'wf-code-reviewer', role: 'Targeted review of changed behavior and required verification; writes the verdict' },
  { id: 'semantic_reviewer', role: 'Behavioral code review' },
];

/** The five node types, in the docs' words. */
export const NODE_TYPES = [
  { type: 'step', label: 'Step', hint: 'One agent runs a prompt in its own session.' },
  { type: 'sequence', label: 'In order', hint: 'Runs the steps inside it one after another.' },
  { type: 'repeat', label: 'Repeat', hint: 'Runs the steps inside it until a condition matches or the cap is reached.' },
  { type: 'parallel', label: 'In parallel', hint: 'Runs independent branches at the same time, then joins them.' },
  { type: 'watch', label: 'Wait for', hint: 'Waits on a pull request or a script of yours, without using model turns while nothing changes.' },
];
export const nodeLabel = (type) => NODE_TYPES.find((t) => t.type === type)?.label || type || '?';

export const JOIN_POLICIES = [
  { value: 'all', label: 'all: every branch must succeed; one failure cancels the others' },
  { value: 'allSettled', label: 'allSettled: wait for every branch, whatever happens' },
  { value: 'any', label: 'any: done as soon as one branch succeeds' },
];
export const ON_MAX = [
  { value: 'pause', label: 'pause: stop and ask you' },
  { value: 'continue', label: 'continue: move on to the next node' },
  { value: 'abort', label: 'abort: stop the whole run' },
];
export const COMPLETION_SIGNALS = ['success', 'need_input', 'error'];
export const INPUT_HINTS = ['prompt', 'file', 'string'];

const CHILD = { sequence: 'steps', repeat: 'steps', parallel: 'branches' };
/** The key that holds a container's children, or '' for a leaf. */
export const childKey = (type) => CHILD[type] || '';

// ---------------------------------------------------------------- read/write

/**
 * Reads a recipe file.
 * @param {string} text
 * @param {'json'|'yaml'} format
 * @returns {{value: Object|null, error: string}} error when the text isn't a recipe object.
 */
export function readRecipe(text, format) {
  if (format === 'json') {
    const { value, error } = parseJson(text || '');
    if (error) return { value: null, error: `Not valid JSON: ${error}` };
    return isObject(value) ? { value, error: '' } : { value: null, error: 'A recipe is a JSON object' };
  }
  const doc = YAML.parseDocument(text || '');
  if (doc.errors.length) return { value: null, error: `Not valid YAML: ${doc.errors[0].message.split('\n')[0]}` };
  const value = doc.toJS();
  return isObject(value) ? { value, error: '' } : { value: null, error: 'A recipe is a mapping of keys to values' };
}

/**
 * Writes a recipe back. JSON is reformatted; YAML keeps comments and the
 * layout of top-level keys that didn't change.
 * @param {string} text the current file.
 * @param {'json'|'yaml'} format
 * @param {Object} recipe
 */
export function writeRecipe(text, format, recipe) {
  if (format === 'json') return `${JSON.stringify(recipe, null, 2)}\n`;
  const doc = YAML.parseDocument(text?.trim() ? text : '{}');
  if (doc.errors.length || !YAML.isMap(doc.contents)) return YAML.stringify(recipe, { lineWidth: 0 });
  const before = doc.toJS() || {};
  for (const key of Object.keys(before)) if (!(key in recipe)) doc.delete(key);
  for (const [key, v] of Object.entries(recipe)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(v)) doc.set(key, v);
  }
  doc.contents.flow = false;
  return doc.toString({ lineWidth: 0 });
}

/** A new recipe from a template, named name, in format. */
export function recipeFromTemplate(id, name, format) {
  const t = RECIPE_TEMPLATES.find((x) => x.id === id) || RECIPE_TEMPLATES[0];
  const value = YAML.parse(t.yaml);
  value.name = name;
  if (format === 'json') return `${JSON.stringify(value, null, 2)}\n`;
  return t.yaml.replace(/^name: .*$/m, `name: ${name}`);
}

// ---------------------------------------------------------------- tree

/** The value at path (an array of keys and indexes). */
export const getAt = (obj, path) => path.reduce((o, k) => (o == null ? undefined : o[k]), obj);

/** A copy of obj with the value at path replaced (or removed, with undefined). */
export function setAt(obj, path, value) {
  if (!path.length) return value;
  const [k, ...rest] = path;
  const copy = Array.isArray(obj) ? [...obj] : { ...(obj || {}) };
  const next = setAt(copy[k], rest, value);
  if (next === undefined && Array.isArray(copy)) copy.splice(k, 1);
  else if (next === undefined) delete copy[k];
  else copy[k] = next;
  return copy;
}

/** Every node in run order: { path, node, depth, container } (container: the parent's type, 'root' at the top). */
export function walkNodes(recipe) {
  const out = [];
  const walk = (list, base, depth, container) => (Array.isArray(list) ? list : []).forEach((node, i) => {
    const path = [...base, i];
    out.push({ path, node, depth, container });
    if (isObject(node) && childKey(node.type)) walk(node[childKey(node.type)], [...path, childKey(node.type)], depth + 1, node.type);
  });
  walk(recipe?.steps, ['steps'], 0, 'root');
  return out;
}

/** A fresh node of type with an id not used in recipe. */
export function newNode(recipe, type) {
  const used = new Set(walkNodes(recipe).map((n) => n.node?.id));
  let i = 1;
  while (used.has(`${type}-${i}`)) i += 1;
  const id = `${type}-${i}`;
  switch (type) {
    case 'sequence': return { type, id, steps: [] };
    case 'repeat': return { type, id, maxIterations: 3, onMaxIterations: 'pause', steps: [] };
    case 'parallel': return { type, id, joinPolicy: 'allSettled', branches: [] };
    case 'watch': return { type, id, handler: 'github-pr', config: { prRef: '.kiro/workflow-output/pr.json' }, idleTimeoutSec: 3600 };
    default: return { type: 'step', id, agent: 'wf-planner', prompt: '' };
  }
}

/** Adds node at the end of the list at listPath (e.g. ['steps'] or ['steps', 1, 'branches']). */
export const addNode = (recipe, listPath, node) => setAt(recipe, listPath, [...(getAt(recipe, listPath) || []), node]);

/** Inserts node at index in the list at listPath. */
export function insertNode(recipe, listPath, index, node) {
  const list = [...(getAt(recipe, listPath) || [])];
  list.splice(index, 0, node);
  return setAt(recipe, listPath, list);
}

/** Removes the node at path. */
export const removeNode = (recipe, path) => setAt(recipe, path, undefined);

/** Moves the node at path one place up (-1) or down (+1) among its siblings. */
export function moveNode(recipe, path, delta) {
  const listPath = path.slice(0, -1);
  const i = path[path.length - 1];
  const list = [...(getAt(recipe, listPath) || [])];
  const j = i + delta;
  if (j < 0 || j >= list.length) return recipe;
  [list[i], list[j]] = [list[j], list[i]];
  return setAt(recipe, listPath, list);
}

// ---------------------------------------------------------------- templates

const TOKEN = /\{\{\s*([^}]+?)\s*\}\}/g;

/** The {{…}} references in a string. */
const tokensIn = (s) => (typeof s === 'string' ? [...s.matchAll(TOKEN)].map((m) => m[1]) : []);

/** Producers (step and watch ids) and artifact names inside a subtree. */
function producersIn(node, out = { ids: [], artifacts: [] }) {
  if (!isObject(node)) return out;
  if ((node.type === 'step' || node.type === 'watch') && node.id) out.ids.push(node.id);
  if (node.type === 'step' && isObject(node.artifacts)) out.artifacts.push(...Object.keys(node.artifacts));
  const key = childKey(node.type);
  if (key) (Array.isArray(node[key]) ? node[key] : []).forEach((c) => producersIn(c, out));
  return out;
}

/**
 * What a node may read: launch inputs, captured outputs and artifacts of
 * nodes that run before it, and {{previous.output}} when there is a previous
 * sibling. Parallel branches see nothing of each other.
 * @param {Object} recipe
 * @param {(string|number)[]} path the node's path.
 * @returns {{inputs: string[], ids: string[], artifacts: string[], previous: boolean}}
 */
function scopeAt(recipe, path) {
  const scope = { inputs: isObject(recipe?.inputs) ? Object.keys(recipe.inputs) : [], ids: [], artifacts: [], previous: false };
  let container = 'root';
  for (let d = 0; d < path.length; d += 2) {
    const list = getAt(recipe, path.slice(0, d + 1)) || [];
    const i = path[d + 1];
    const last = d + 2 >= path.length;
    if (container !== 'parallel') {
      list.slice(0, i).forEach((sib) => { const p = producersIn(sib); scope.ids.push(...p.ids); scope.artifacts.push(...p.artifacts); });
      if (last) scope.previous = i > 0;
    }
    container = list[i]?.type;
  }
  return scope;
}

/**
 * What a node reads: the step and watch ids whose output it uses, and the
 * artifact names. {{previous.output}} resolves to the node just before it.
 * @returns {{ids: string[], artifacts: string[]}}
 */
export function readsFrom(recipe, path) {
  const node = getAt(recipe, path);
  const out = { ids: [], artifacts: [] };
  if (!isObject(node)) return out;
  templatedStrings(node).forEach(([, s]) => tokensIn(s).forEach((tok) => {
    let m = /^(?:steps\.)?([\w-]+)\.(?:output|terminal)$/.exec(tok);
    if (tok === 'previous.output') {
      const i = path[path.length - 1];
      const prev = i > 0 ? getAt(recipe, [...path.slice(0, -1), i - 1]) : null;
      if (prev) out.ids.push(...producersIn(prev).ids.slice(-1));
    } else if (m) out.ids.push(m[1]);
    else if ((m = /^artifacts\.([\w-]+)$/.exec(tok))) out.artifacts.push(m[1]);
  }));
  const sw = typeof node.stopWhen === 'string' ? /^([\w-]+)\.terminal$/.exec(node.stopWhen) : null;
  if (sw) out.ids.push(sw[1]);
  return { ids: [...new Set(out.ids)], artifacts: [...new Set(out.artifacts)] };
}

/** The node that registers each artifact name. */
export function artifactOwners(recipe) {
  const owners = {};
  walkNodes(recipe).forEach(({ node }) => { if (isObject(node?.artifacts)) Object.keys(node.artifacts).forEach((a) => { owners[a] = node.id; }); });
  return owners;
}

/** Kiro's run and node statuses, in plain words. */
export const RUN_STATUS = {
  pending: { label: 'not started', color: 'text.secondary' },
  running: { label: 'running', color: 'info.main' },
  paused: { label: 'paused', color: 'warning.main' },
  completed: { label: 'done', color: 'success.main' },
  failed: { label: 'failed', color: 'error.main' },
  aborted: { label: 'stopped', color: 'error.light' },
  skipped: { label: 'skipped', color: 'text.disabled' },
};

/**
 * A run's node tree as one status per recipe node id: the latest iteration
 * of a repeated node wins, and how many times it ran is kept.
 * @param {Object} root workflow-state.json's root node.
 * @returns {Object<string, Object>} id → { status, agentName, startedAt, endedAt, sessionId, capturedOutput, artifacts, failureReason, awaitingUserInput, runs }
 */
export function runStatusById(root) {
  const out = {};
  const walk = (n) => {
    if (!isObject(n)) return;
    const prev = out[n.nodeId];
    if (n.nodeId) out[n.nodeId] = { ...n, runs: (prev?.runs || 0) + 1, iteration: n.iteration ?? prev?.iteration };
    (n.children || []).forEach(walk);
  };
  walk(root);
  return out;
}

/** The values Insert offers at a node, as {token, label}. */
export function insertOptions(recipe, path) {
  const s = scopeAt(recipe, path);
  return [
    ...s.inputs.map((n) => ({ token: `{{${n}}}`, label: 'launch input' })),
    ...(s.previous ? [{ token: '{{previous.output}}', label: 'output of the node just before' }] : []),
    ...s.ids.map((id) => ({ token: `{{${id}.output}}`, label: `output of ${id}` })),
    ...s.artifacts.map((a) => ({ token: `{{artifacts.${a}}}`, label: `file path registered as ${a}` })),
  ];
}

/** Checks one {{…}} reference at a node; returns a problem or ''. */
function checkToken(tok, scope, allIds, allArtifacts, where) {
  if (tok === 'previous.output') {
    return scope.previous ? '' : `${where}: {{previous.output}} has nothing before it here (a first node, or inside a parallel branch).`;
  }
  let m = /^(?:steps\.)?([\w-]+)\.output$/.exec(tok);
  if (m) {
    if (scope.ids.includes(m[1])) return '';
    return allIds.has(m[1]) ? `${where}: {{${tok}}} reads ${m[1]}, which doesn't run before this.` : `${where}: no step or watch called ${m[1]}.`;
  }
  m = /^artifacts\.([\w-]+)$/.exec(tok);
  if (m) {
    if (scope.artifacts.includes(m[1])) return '';
    return allArtifacts.has(m[1]) ? `${where}: artifact ${m[1]} is registered by a step that doesn't run before this.` : `${where}: no step registers an artifact called ${m[1]}.`;
  }
  if (/^[\w-]+$/.test(tok)) return scope.inputs.includes(tok) ? '' : `${where}: {{${tok}}} isn't declared in inputs, so it stays as literal text.`;
  return `${where}: Kiro doesn't know {{${tok}}}.`;
}

// ---------------------------------------------------------------- checks

const BAD_JSONPATH = /[[\]*]|\.\.|.\$/;

/** The string values a node's templates can appear in. */
function templatedStrings(node) {
  const out = [];
  if (typeof node.prompt === 'string') out.push(['prompt', node.prompt]);
  if (isObject(node.artifacts)) Object.entries(node.artifacts).forEach(([k, v]) => out.push([`artifact ${k}`, v]));
  if (node.type === 'watch' && isObject(node.config)) {
    Object.entries(node.config).forEach(([k, v]) => { if (k !== 'command' && typeof v === 'string') out.push([`config.${k}`, v]); });
  }
  const sc = node.stopCondition || node.completion;
  if (isObject(sc?.fileCheck) && typeof sc.fileCheck.path === 'string') out.push(['stop condition path', sc.fileCheck.path]);
  if (typeof node.stopWhen === 'string') out.push(['stopWhen', node.stopWhen]);
  return out;
}

function checkStop(sc, where, add) {
  if (!isObject(sc)) { add('error', `${where} must be an object with containsText, completionSignal or fileCheck.`); return; }
  if (!('containsText' in sc) && !('completionSignal' in sc) && !('fileCheck' in sc)) add('error', `${where} needs containsText, completionSignal or fileCheck.`);
  if ('completionSignal' in sc && !COMPLETION_SIGNALS.includes(sc.completionSignal)) add('error', `${where}: completionSignal is success, need_input or error.`);
  if ('fileCheck' in sc) {
    const f = sc.fileCheck;
    if (!isObject(f) || !f.path || !('jsonPath' in f) || !('value' in f)) add('error', `${where}: fileCheck needs path, jsonPath and value.`);
    else if (typeof f.jsonPath === 'string' && BAD_JSONPATH.test(f.jsonPath.replace(/^\$\.?/, ''))) add('error', `${where}: jsonPath "${f.jsonPath}" uses [ ], *, .. or a second $, which Kiro rejects. Use a dotted path like verdict.`);
  }
}

/**
 * Checks a recipe against the documented rules (the ones validate_workflow
 * reports, and the template rules). Unknown custom agents and watch handler
 * availability can only be checked by Kiro at launch.
 * @param {Object} recipe
 * @param {{agents?: string[]}} [known] agent ids this scope has.
 * @returns {{path: (string|number)[], severity: 'error'|'warning', message: string}[]} path [] for the recipe itself.
 */
export function checkRecipe(recipe, { agents = [] } = {}) {
  const out = [];
  const nodes = walkNodes(recipe);
  const allIds = new Set(nodes.map((n) => n.node?.id).filter(Boolean));
  const allArtifacts = new Set(nodes.flatMap((n) => (isObject(n.node?.artifacts) ? Object.keys(n.node.artifacts) : [])));
  const knownAgents = new Set([...agents, ...BUNDLED_AGENTS.map((a) => a.id)]);
  const root = (severity, message) => out.push({ path: [], severity, message });
  if (!recipe?.name || typeof recipe.name !== 'string') root('error', 'The recipe needs a name.');
  if (!Array.isArray(recipe?.steps) || !recipe.steps.length) root('error', 'The recipe needs at least one entry in steps.');
  if ('inputs' in (recipe || {}) && !isObject(recipe.inputs)) root('error', 'inputs is a map of names to type hints such as prompt, file or string.');
  const steps = nodes.filter((n) => n.node?.type === 'step').length;
  if (steps > 50) root('error', `${steps} steps: a recipe can have at most 50.`);
  const seen = new Set();
  nodes.forEach(({ path, node, depth }) => {
    const add = (severity, message) => out.push({ path, severity, message });
    if (!isObject(node)) { add('error', 'Every entry must be a node object.'); return; }
    const t = node.type;
    if (!NODE_TYPES.some((x) => x.type === t)) { add('error', `Unknown type "${t}". Use step, sequence, repeat, parallel or watch.`); return; }
    if (!node.id) add('error', 'Every node needs an id.');
    else if (seen.has(node.id)) add('error', `The id ${node.id} is used twice; every id must be unique.`);
    seen.add(node.id);
    if (depth >= 8) add('error', 'Recipes can nest at most 8 levels.');
    if (t === 'step') {
      if (!node.agent) add('error', 'A step needs an agent.');
      else if (!knownAgents.has(node.agent)) add('warning', `No agent called ${node.agent} here. Use one of yours or a bundled wf-* agent; Kiro's built-in sub-agents can't run a step.`);
      if (!node.prompt) add('error', 'A step needs a prompt.');
      if ('completion' in node) {
        checkStop(node.completion, 'completion', add);
        const inParallel = path.some((k, i) => k === 'branches' && i < path.length - 1);
        if (inParallel) add('error', 'A step with completion (interactive) can\'t be inside a parallel.');
      }
    }
    if (childKey(t) && !Array.isArray(node[childKey(t)])) add('error', `${nodeLabel(t)} needs ${childKey(t)}.`);
    else if (childKey(t) && !node[childKey(t)].length) add('warning', `${nodeLabel(t)} ${node.id || ''} has nothing inside it yet.`);
    if (t === 'repeat') {
      if (!(Number.isInteger(node.maxIterations) && node.maxIterations > 0)) add('error', 'A repeat needs a positive whole maxIterations, so it can\'t loop forever.');
      if (!ON_MAX.some((o) => o.value === node.onMaxIterations)) add('error', 'A repeat needs onMaxIterations: pause, continue or abort.');
      if ('stopCondition' in node && 'stopWhen' in node) add('error', 'Use stopCondition or stopWhen, not both.');
      if ('stopCondition' in node) checkStop(node.stopCondition, 'stopCondition', add);
      if ('stopWhen' in node && !(typeof node.stopWhen === 'string' && (/^[\w-]+\.terminal$/.test(node.stopWhen) || /^\{\{[^}]+\}\}\s+contains\s+\S/.test(node.stopWhen)))) {
        add('error', 'stopWhen is "<watch id>.terminal" or "{{<id>.output}} contains <text>".');
      }
    }
    if (t === 'parallel' && !JOIN_POLICIES.some((j) => j.value === node.joinPolicy)) add('error', 'A parallel needs joinPolicy: all, allSettled or any.');
    if (t === 'watch') {
      const c = isObject(node.config) ? node.config : null;
      if (!['github-pr', 'command'].includes(node.handler)) add('error', 'A watch needs handler github-pr or command.');
      if (!c) add('error', 'A watch needs a config object.');
      if (c && 'idleTimeoutSec' in c) add('warning', 'idleTimeoutSec goes on the watch itself, not in config.');
      if (c && node.handler === 'github-pr') {
        if (!c.prRef && !c.url) add('error', 'A github-pr watch needs config.prRef (a JSON file with the PR url) or config.url.');
        if ('pollIntervalSec' in c && c.pollIntervalSec < 30) add('error', 'github-pr polls at most every 30 seconds.');
      }
      if (c && node.handler === 'command') {
        if (!c.command) add('error', 'A command watch needs config.command.');
        if ('args' in c) add('error', 'A command watch has no args: put the arguments in the command string.');
        if (/\{\{/.test(c.command || '')) add('error', 'Templates aren\'t allowed in config.command.');
        if ('pollIntervalSec' in c && c.pollIntervalSec < 10) add('error', 'A command watch polls at most every 10 seconds.');
      }
    }
    // Templates: everything must exist and run before this node.
    let scope = scopeAt(recipe, path);
    if (t === 'repeat') { // its stop condition is checked after an iteration: the body counts
      const body = producersIn({ ...node, id: undefined });
      scope = { ...scope, ids: [...scope.ids, ...body.ids], artifacts: [...scope.artifacts, ...body.artifacts] };
    }
    templatedStrings(node).forEach(([where, s]) => tokensIn(s).forEach((tok) => {
      const p = checkToken(tok, scope, allIds, allArtifacts, where);
      if (p) add(p.includes('literal text') ? 'warning' : 'error', p);
    }));
  });
  return out;
}

/** The chat command that runs a saved recipe. */
export const runCommand = (recipe) => `/workflow run${recipe?.name ? ` ${recipe.name}` : ''}`;

/** What to ask Kiro to validate a saved recipe file. */
export const validatePrompt = (path) => `Run validate_workflow on ${path}. Report every error and warning, and do not launch the workflow.`;
