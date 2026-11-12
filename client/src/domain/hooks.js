/**
 * @fileoverview The Kiro CLI V3 hook model. Inline agent hooks and standalone
 * .kiro/hooks/*.json files share one definition shape:
 *   { name, trigger, matcher?, action: { type: 'command'|'agent', command|prompt }, timeout?, enabled?, confirm? }
 * The CLI 2.x object form is in domain/v2.js.
 * Sources: https://kiro.dev/docs/hooks/, /hooks/types and /cli/v3/hooks-migration/
 */
import { isObject } from './json.js';
import { v2HookCount, v3Trigger } from './v2.js';

/**
 * matcher: what a trigger's matcher is tested against (null = not evaluated).
 * blocks: what exit code 2 stops, when the trigger can stop something.
 * since: the first Kiro CLI with the trigger, when it's newer than the rest.
 */
export const TRIGGERS = [
  { value: 'SessionStart', label: 'Session start', matcher: null, blocks: '' },
  { value: 'UserPromptSubmit', label: 'Prompt submit', matcher: null, blocks: '' },
  { value: 'PreToolUse', label: 'Before a tool runs', matcher: 'tool', blocks: 'the tool call is blocked' },
  { value: 'PostToolUse', label: 'After a tool runs', matcher: 'tool', blocks: '' },
  { value: 'PostFileCreate', label: 'After Kiro creates a file', matcher: 'file', blocks: '' },
  { value: 'PostFileSave', label: 'After Kiro saves a file', matcher: 'file', blocks: '' },
  { value: 'PostFileDelete', label: 'After Kiro deletes a file', matcher: 'file', blocks: '' },
  { value: 'PreTaskExec', label: 'Before a spec task', matcher: null, blocks: 'the task is blocked' },
  { value: 'PostTaskExec', label: 'After a spec task', matcher: null, blocks: '' },
  { value: 'PreCompact', label: 'Before Kiro compacts the chat', matcher: null, blocks: 'the compaction is cancelled', since: '3.1.0' },
  { value: 'PostCompact', label: 'After Kiro compacts the chat', matcher: null, blocks: '', since: '3.1.0' },
  { value: 'Stop', label: 'Agent finishes responding', matcher: null, blocks: '' },
  { value: 'SessionEnd', label: 'Session ends (CLI V3)', matcher: null, blocks: '' },
  { value: 'Manual', label: 'Manual (CLI V3 lists it, but /hooks can\'t run it yet)', matcher: null, blocks: '' },
];

/** A confirm block can only ask before a command hook on Stop. */
export const canConfirm = (hook) => hook.trigger === 'Stop' && hook.action?.type === 'command';

/** The confirm block a new confirmation starts with (the docs' example). */
export const NEW_CONFIRM = {
  question: 'Run this now?',
  options: [{ id: 'run', label: 'Yes, run it', run: true }, { id: 'skip', label: 'Not this time', run: false }],
};

/** @returns {string} what's wrong with a confirm block, or ''. */
function confirmError(confirm) {
  if (!isObject(confirm)) return 'Confirmation must be an object';
  if (!String(confirm.question || '').trim()) return 'The confirmation needs a question';
  const options = Array.isArray(confirm.options) ? confirm.options : [];
  if (!options.length) return 'The confirmation needs at least one option';
  const ids = new Set();
  for (const o of options) {
    if (!isObject(o) || !String(o.id || '').trim() || !String(o.label || '').trim()) return 'Each option needs an ID and a label';
    if (ids.has(o.id)) return `Option ID "${o.id}" is used twice`;
    ids.add(o.id);
  }
  return '';
}

/** @returns {Object|undefined} the trigger definition for a name, including a 2.x spelling V3 still accepts. */
export const triggerInfo = (name) => TRIGGERS.find((t) => t.value === v3Trigger(name));

/** @returns {Object[]} the hook definitions in value (V3 array form only). */
export const hookList = (value) => (Array.isArray(value) ? value.filter(isObject) : []);

/** @returns {number} how many hooks value holds, in either form. */
export function hookCount(value) {
  if (Array.isArray(value)) return hookList(value).length;
  return v2HookCount(value); // 2.x: remove with V2 support
}

/** @returns {Object} a new hook definition with sensible defaults. */
export const newHook = (existing) => ({
  name: uniqueName(existing, 'new-hook'),
  trigger: 'PostToolUse',
  matcher: 'write',
  action: { type: 'command', command: '' },
});

/** @returns {string} base, or base-2, base-3… if another hook already uses it. */
function uniqueName(hooks, base) {
  const names = new Set(hooks.map((h) => h.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

/** @returns {string} a problem with hook that kiro-cli would reject, or ''. */
export function hookError(hook) {
  if (!hook.name || !String(hook.name).trim()) return 'Name is required';
  if (!triggerInfo(hook.trigger)) return `Unknown trigger "${hook.trigger}"`;
  const action = isObject(hook.action) ? hook.action : {};
  if (action.type === 'agent') return action.prompt ? '' : 'Prompt is required';
  if (action.type !== 'command') return 'Action type must be command or agent';
  if (!action.command) return 'Command is required';
  return hook.confirm !== undefined && canConfirm(hook) ? confirmError(hook.confirm) : '';
}

/** An empty standalone hook file, as the docs define it. */
export const EMPTY_HOOK_FILE = { version: 'v1', hooks: [] };

/**
 * Changes a hook's trigger. A matcher only carries over when the new trigger
 * matches the same kind of thing (tools or files); otherwise it is dropped,
 * because a file regex means nothing to a tool trigger and Kiro ignores it
 * on triggers without a matcher.
 */
export function withTrigger(hook, trigger) {
  const before = triggerInfo(hook.trigger)?.matcher ?? null;
  const after = triggerInfo(trigger)?.matcher ?? null;
  const next = { ...hook, trigger };
  if (before !== after) delete next.matcher;
  return next;
}
