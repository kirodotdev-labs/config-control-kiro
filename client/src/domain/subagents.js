/**
 * @fileoverview Sub-agent access the V3 way (kiro.dev/docs/custom-agents/subagents):
 * the agents this agent may start are `subagent/<name>` entries in `tools`,
 * and those that start without asking are an allow rule for the `subagent`
 * capability in `permissions`. The CLI 2.x form is in domain/v2.js.
 */
import { isObject, setField, stringList } from './json.js';

const PREFIX = 'subagent/';

/** The agents `tools` lets this agent start by name. */
export const subagentTargets = (tools) => stringList(tools).filter((t) => t.startsWith(PREFIX)).map((t) => t.slice(PREFIX.length));

/** Entries that let the agent start any agent: the subagent tag, invoke_sub_agent, and @builtin and * (which include both). */
const ANY = ['subagent', 'invoke_sub_agent', '@builtin', '*'];

/**
 * Which agents `tools` lets this agent start: none, only the named ones, or
 * any agent. `because` is the entry that allows any agent.
 * @returns {{mode: 'none'|'some'|'any', because?: string}}
 */
export function subagentMode(tools) {
  const list = stringList(tools);
  const because = ANY.find((t) => list.includes(t));
  if (because) return { mode: 'any', because };
  return { mode: subagentTargets(list).length ? 'some' : 'none' };
}

/**
 * Sets which agents this agent may start. none removes every sub-agent
 * entry; some keeps only `subagent/<name>` for names; any uses the subagent
 * tag. @builtin and * are left alone (they're chosen in Tools).
 * @param {string[]} tools
 * @param {'none'|'some'|'any'} mode
 * @param {string[]} [names] for some.
 * @returns {string[]} the new tools list.
 */
export function setSubagentMode(tools, mode, names = []) {
  const kept = stringList(tools).filter((t) => !t.startsWith(PREFIX) && t !== 'subagent' && t !== 'invoke_sub_agent');
  if (mode === 'any') return [...kept, 'subagent'];
  if (mode === 'some') return [...kept, ...names.map((n) => PREFIX + n)];
  return kept;
}

const isTrustRule = (r) => isObject(r) && r.capability === 'subagent' && r.effect === 'allow';

/** The agents an allow rule for the subagent capability starts without asking. */
export function trustedSubagents(permissions) {
  const rules = Array.isArray(permissions?.rules) ? permissions.rules : [];
  return rules.filter(isTrustRule).flatMap((r) => stringList(r.match));
}

/**
 * Sets the agents that start without asking: one allow rule for the
 * subagent capability, removed when the list is empty. Other rules stay.
 * @returns {Object} the new spec.
 */
export function setTrustedSubagents(spec, names) {
  const permissions = isObject(spec.permissions) ? spec.permissions : {};
  const rules = Array.isArray(permissions.rules) ? permissions.rules : [];
  const at = rules.findIndex(isTrustRule);
  const next = rules.filter((r) => !isTrustRule(r));
  if (names.length) {
    const rule = { ...(at >= 0 ? rules[at] : { capability: 'subagent', effect: 'allow' }), match: names };
    next.splice(at >= 0 ? Math.min(at, next.length) : next.length, 0, rule);
  }
  return setField(spec, 'permissions', setField(permissions, 'rules', next));
}
