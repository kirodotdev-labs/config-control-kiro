/**
 * @fileoverview Agent ids and the spec for a new agent. Whether an agent is
 * ready for V3 is decided on the server (agent/readiness.go), so lists and
 * the editor always agree.
 * Source: https://kiro.dev/docs/custom-agents/configuration-reference/
 */
/**
 * Agent ids double as file names and as a `kiro-cli --agent` argument, so they
 * are limited to characters that are safe in both.
 */
export const AGENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** @returns {Object} the spec written for a newly created agent. */
export const newAgentSpec = (id) => ({ name: id, description: '', prompt: '', tools: ['@builtin'] });
