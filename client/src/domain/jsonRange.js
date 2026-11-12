/**
 * @fileoverview Finds where a key and its value sit in JSON text, by scanning
 * (not regex), so a key with the same name at another depth never matches.
 */

/**
 * @param {string} text JSON text of an object.
 * @param {string|(string|number)[]} path a top-level key, or keys (and array indexes) from the top down.
 * @returns {{from: number, to: number}|null} character range of `"key": value` (or of the array element).
 */
export function findTopLevelKey(text, path) {
  const keys = Array.isArray(path) ? path : [path];
  let range = { from: 0, to: text.length, valueFrom: text.indexOf('{') };
  for (const key of keys) {
    if (range.valueFrom < 0) return null;
    const c = text[range.valueFrom];
    if (typeof key === 'number' ? c !== '[' : c !== '{') return null;
    range = typeof key === 'number' ? findElement(text, key, range.valueFrom) : findChild(text, key, range.valueFrom, range.to);
    if (!range) return null;
  }
  return { from: range.from, to: range.to };
}

/** The index-th element of the array starting at open. */
function findElement(text, index, open) {
  let i = open + 1;
  for (let n = 0; ; n += 1) {
    while (/\s/.test(text[i] || '')) i += 1;
    if (i >= text.length || text[i] === ']') return null;
    const to = valueEnd(text, i);
    if (n === index) return { from: i, to, valueFrom: i };
    i = to;
    while (/\s/.test(text[i] || '')) i += 1;
    if (text[i] === ',') i += 1;
  }
}

/**
 * The keys (and array indexes), from the top down, whose value contains
 * position pos: [] when pos is between members or the text isn't an object.
 * At most depth steps.
 * @param {string} text JSON text of an object.
 * @param {number} pos character offset.
 * @param {number} [depth]
 * @returns {(string|number)[]}
 */
export function keyPathAt(text, pos, depth = 1) {
  const path = [];
  let open = text.indexOf('{');
  while (path.length < depth && open >= 0 && pos >= open) {
    const hit = text[open] === '{' ? memberAt(text, open, pos) : text[open] === '[' ? elementAt(text, open, pos) : null;
    if (!hit) break;
    path.push(hit.key);
    open = hit.valueFrom;
  }
  return path;
}

/** The element of the array starting at open that contains pos: {key: index, valueFrom}. */
function elementAt(text, open, pos) {
  let i = open + 1;
  for (let n = 0; ; n += 1) {
    while (/\s/.test(text[i] || '')) i += 1;
    if (i >= text.length || text[i] === ']') return null;
    const to = valueEnd(text, i);
    if (pos >= i && pos <= to) return { key: n, valueFrom: i };
    if (pos < i) return null;
    i = to;
    while (/\s/.test(text[i] || '')) i += 1;
    if (text[i] === ',') i += 1;
  }
}

/** The member of the object starting at open whose `"key": value` contains pos. */
function memberAt(text, open, pos) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    const c = text[i];
    if (c === '"') {
      const end = stringEnd(text, i);
      if (depth === 1) {
        let j = end + 1;
        while (/\s/.test(text[j] || '')) j += 1;
        if (text[j] === ':') {
          let v = j + 1;
          while (/\s/.test(text[v] || '')) v += 1;
          const to = valueEnd(text, v);
          if (pos >= i && pos <= to) return { key: text.slice(i + 1, end), valueFrom: v };
          if (pos < i) return null;
          i = to - 1;
          continue;
        }
      }
      i = end;
    } else if (c === '{' || c === '[') {
      depth += 1;
    } else if (c === '}' || c === ']') {
      depth -= 1;
      if (depth === 0) return null;
    }
  }
  return null;
}

/** Finds `"key": value` directly inside the object starting at open. */
function findChild(text, key, open, limit) {
  let depth = 0;
  for (let i = open; i < limit; i += 1) {
    const c = text[i];
    if (c === '"') {
      const end = stringEnd(text, i);
      if (depth === 1 && text.slice(i + 1, end) === key) {
        let j = end + 1;
        while (/\s/.test(text[j] || '')) j += 1;
        if (text[j] === ':') {
          let v = j + 1;
          while (/\s/.test(text[v] || '')) v += 1;
          return { from: i, to: valueEnd(text, v), valueFrom: v };
        }
      }
      i = end;
    } else if (c === '{' || c === '[') {
      depth += 1;
    } else if (c === '}' || c === ']') {
      depth -= 1;
      if (depth === 0) return null;
    }
  }
  return null;
}

/** Index of the closing quote of the string starting at i. */
function stringEnd(text, i) {
  let j = i + 1;
  while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
  return j;
}

/** Index just past the JSON value starting at i (trailing space excluded). */
function valueEnd(text, i) {
  let end = rawValueEnd(text, i);
  while (end > i && /\s/.test(text[end - 1])) end -= 1;
  return end;
}

function rawValueEnd(text, i) {
  let depth = 0;
  for (let j = i; j < text.length; j += 1) {
    const c = text[j];
    if (c === '"') { j = stringEnd(text, j); if (depth === 0) return j + 1; continue; }
    if (c === '{' || c === '[') depth += 1;
    else if (c === '}' || c === ']') { if (depth === 0) return j; depth -= 1; if (depth === 0) return j + 1; }
    else if (c === ',' && depth === 0) return j;
  }
  return text.length;
}
