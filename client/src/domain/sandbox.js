/**
 * @fileoverview Sandbox policy rules from kiro.dev/docs/sandbox: the keys,
 * the network modes from strictest to most open, and the rule that a
 * Workspace can only tighten an active Global policy.
 */

/** Network modes, strictest first. */
export const NETWORK_MODES = [
  { value: 'DEFAULT_BLOCKED', label: 'Blocked', help: 'No outbound network, except hosts you allow with sandbox_network permission rules. The default.' },
  { value: 'COMMON_DEPENDENCIES', label: 'Common services', help: 'Package registries, source hosting, build and container services are reachable. Other hosts stay blocked unless a rule allows them.' },
  { value: 'DEFAULT_ALLOWED', label: 'Open', help: 'Commands can reach any host. sandbox_network deny rules are not reliable in this mode.' },
];

const rank = (mode) => {
  const i = NETWORK_MODES.findIndex((m) => m.value === (mode || 'DEFAULT_BLOCKED'));
  return i < 0 ? 0 : i;
};

/** The Global policy is active (a Workspace can then only tighten it). */
export const globalActive = (global) => global?.enabled === true;

/**
 * Problems with a policy. In a Workspace with an active Global policy,
 * anything looser than Global is reported, because Kiro won't apply it.
 * @param {Object} config this scope's sandbox.json
 * @param {Object} [global] the Global policy, when editing a Workspace
 * @returns {string[]}
 */
export function sandboxProblems(config, global) {
  const out = [];
  if (config.enabled !== undefined && typeof config.enabled !== 'boolean') out.push('"enabled" must be true or false.');
  if (config.networkAccess !== undefined && !NETWORK_MODES.some((m) => m.value === config.networkAccess)) {
    out.push(`"networkAccess" must be one of ${NETWORK_MODES.map((m) => m.value).join(', ')} (case-sensitive).`);
  }
  if (config.mcpSandboxing !== undefined && typeof config.mcpSandboxing !== 'boolean') out.push('"mcpSandboxing" must be true or false.');
  if (Object.keys(config).length && config.enabled === undefined) out.push('"enabled" is required: Kiro ignores a sandbox.json without it.');
  if (globalActive(global)) {
    if (config.enabled === false) out.push('Global turns the sandbox on, and a Workspace can\'t turn it off. Kiro keeps it on here.');
    if (config.networkAccess && rank(config.networkAccess) > rank(global.networkAccess)) {
      out.push(`Global allows only ${global.networkAccess || 'DEFAULT_BLOCKED'}; a Workspace can't open the network further. Kiro uses the Global mode.`);
    }
    if (global.mcpSandboxing === true && config.mcpSandboxing === false) out.push('Global wraps MCP servers in the sandbox, and a Workspace can\'t turn that off.');
  }
  return out;
}

/** Modes a Workspace may choose: Global's mode or stricter, when Global is active. */
export const allowedModes = (global) => (globalActive(global)
  ? NETWORK_MODES.filter((m) => rank(m.value) <= rank(global.networkAccess)) : NETWORK_MODES);

/**
 * The permission rules the sandbox follows (kiro.dev/docs/permissions): sandbox_network
 * names the hosts sandboxed commands can reach, and fs_read and fs_write (also through
 * filesystem and all, which expand to them) shape the paths they can see and write.
 */
export const SANDBOX_CAPS = ['sandbox_network', 'fs_read', 'fs_write', 'filesystem', 'all'];

/** The rules of a permissions file that the sandbox follows, in file order. */
export const sandboxRules = (rules) => rules.filter((r) => SANDBOX_CAPS.includes(r.capability));

/**
 * Puts an edited list of sandbox rules back into the whole rule list: each takes
 * the place of a sandbox rule in turn, so other rules and the order among these
 * (which decides sandbox_network) are kept; extra ones go at the end.
 */
export function mergeSandboxRules(rules, next) {
  const queue = [...next];
  const out = [];
  rules.forEach((r) => {
    if (!SANDBOX_CAPS.includes(r.capability)) out.push(r);
    else if (queue.length) out.push(queue.shift());
  });
  return [...out, ...queue];
}
