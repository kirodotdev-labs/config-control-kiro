/**
 * @fileoverview The V3 permission rule model shared by permissions.yaml and an
 * agent's inline permissions block: { capability, match?, exclude?, effect }.
 * Source: https://kiro.dev/docs/permissions/
 */

/** MUI palette color per effect. */
export const EFFECT_COLOR = { allow: 'success', ask: 'warning', deny: 'error', evaluate: 'info' };

/**
 * Turns one preset on or off, keeping the order and any name this app doesn't know.
 * @param {string[]} policies
 * @param {string} id
 * @param {boolean} on
 */
export const togglePolicy = (policies, id, on) =>
  (on ? (policies.includes(id) ? policies : [...policies, id]) : policies.filter((p) => p !== id));

/** @returns {Object} a new rule with sensible defaults. */
export const newRule = () => ({ capability: 'shell', match: [], effect: 'ask' });
