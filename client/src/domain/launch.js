/**
 * @fileoverview Builds the kiro-cli commands the Terminal button runs. V3 is
 * opt-in per invocation, so every chat command passes --v3.
 * Source: https://kiro.dev/docs/reference/cli-commands/
 */
import { AGENT_ID_PATTERN } from './agentSpec.js';

/**
 * @param {{agentId?: string, resume?: boolean, cloud?: boolean, v2?: boolean}} opts cloud runs the chat in a
 *   Kiro cloud sandbox (kiro.dev/docs/cloud-sessions); it can't resume, so it wins over resume.
 *   v2 starts the CLI 2.x engine instead, for an agent Kiro hasn't upgraded (no cloud there).
 * @returns {string} e.g. "kiro-cli chat --v3 --agent reviewer --resume-picker"
 */
export function chatCommand({ agentId, resume = false, cloud = false, v2 = false } = {}) {
  const parts = ['kiro-cli', 'chat', v2 ? '--v2' : '--v3']; // 2.x: the --v2 choice goes with V2 support
  if (agentId) parts.push('--agent', agentId);
  if (cloud && !v2) parts.push('--cloud');
  else if (resume) parts.push('--resume-picker');
  return parts.join(' ');
}

/** @returns {string} an error when agentId can't be passed to kiro-cli, else ''. */
export const launchableAgentError = (agentId) =>
  AGENT_ID_PATTERN.test(agentId)
    ? ''
    : `"${agentId}" contains characters a terminal command can't safely carry. Rename the file to letters, digits, dot, dash or underscore.`;

/** Quotes a path for a copy-paste shell command, leaving a leading ~ expandable. */
function shellPath(dir) {
  if (/^[\w./~:\\-]+$/.test(dir)) return dir;
  const quote = (s) => `"${s.replace(/(["\\$`])/g, '\\$1')}"`;
  return dir.startsWith('~/') ? `~/${quote(dir.slice(2))}` : quote(dir);
}

/**
 * Prefixes cmd with a change of directory in the user's shell syntax.
 * @param {string} dir
 * @param {string} cmd
 * @param {boolean} powershell native Windows uses `;` instead of `&&`.
 */
export const withDirectory = (dir, cmd, powershell) =>
  `cd ${shellPath(dir)}${powershell ? ';' : ' &&'} ${cmd}`;
