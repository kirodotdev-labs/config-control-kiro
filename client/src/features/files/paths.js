/**
 * @fileoverview Path string helpers that work for POSIX and Windows paths.
 */

/** @returns {string} the parent directory of path ('/' and 'C:\' are their own parents). */
export function parentOf(path) {
  const trimmed = path.replace(/[\\/]+$/, '');
  const i = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  if (i < 0) return path;
  if (i === 0) return '/';
  const parent = trimmed.slice(0, i);
  return /^[A-Za-z]:$/.test(parent) ? `${parent}\\` : parent;
}

/** File types the text editor can't show: images, archives, binaries, databases, documents. */
const BINARY = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'svgz', 'pdf', 'zip', 'gz', 'tgz', 'tar', '7z', 'rar', 'exe', 'dll', 'so', 'dylib', 'bin', 'db', 'sqlite', 'sqlite3', 'woff', 'woff2', 'ttf', 'otf', 'mp3', 'mp4', 'mov', 'wav', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pyc', 'class', 'jar', 'wasm']);
/** @returns {boolean} whether the file's type can't be edited as text. */
export const isBinaryName = (name) => BINARY.has(extensionOf(name));

/** @returns {string} the last segment of path. */
export const baseName = (path) => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path;

/** @returns {string} the lower-case extension of name without the dot, or ''. */
export const extensionOf = (name) => {
  const m = /\.([^.\\/]+)$/.exec(name);
  return m ? m[1].toLowerCase() : '';
};
