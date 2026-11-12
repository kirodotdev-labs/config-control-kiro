/**
 * @fileoverview Small, order-preserving JSON helpers. Config files are
 * hand-edited, so every edit keeps existing key positions: updating a key keeps
 * its place, a new key is appended, and an emptied optional key is removed.
 */

/** @returns {boolean} whether v is a plain JSON object. */
export const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** @returns {boolean} whether a and b serialise identically (key order counts). */
export const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Parses text as JSON.
 * @param {string} text
 * @returns {{value: any, error: string}} error is '' when the text is valid.
 */
export function parseJson(text) {
  try {
    return { value: JSON.parse(text), error: '' };
  } catch (e) {
    return { value: undefined, error: e.message };
  }
}

/** Pretty-prints a value the way the files are written (2-space indent). */
export const formatJson = (value) => JSON.stringify(value ?? {}, null, 2);

/** @returns {boolean} whether v counts as empty for an optional field. */
function isEmpty(v) {
  if (v === undefined || v === null || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (isObject(v)) return Object.keys(v).length === 0;
  return false;
}

/**
 * Returns a copy of obj with key set to value, or removed when value is empty.
 * Existing keys keep their position; new keys are appended.
 * @param {Object} obj
 * @param {string} key
 * @param {any} value
 * @param {{keepEmpty?: boolean}} [opts] keep the key even when value is empty.
 */
export function setField(obj, key, value, { keepEmpty = false } = {}) {
  if (!keepEmpty && isEmpty(value)) {
    if (!(key in obj)) return obj;
    const { [key]: _removed, ...rest } = obj;
    return rest;
  }
  return { ...obj, [key]: value };
}

/** @returns {string[]} the string items of v, or [] when v is not an array. */
export const stringList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
