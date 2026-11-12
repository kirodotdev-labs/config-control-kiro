/**
 * @fileoverview Comparing Kiro CLI versions, for features that need a
 * minimum version.
 */

/**
 * Whether a dotted version is at least min, comparing numbers ("2.36" < "2.100").
 * An unknown version answers true, so nothing is flagged without evidence.
 * @param {string|undefined} version
 * @param {string} min
 */
export function versionAtLeast(version, min) {
  if (!version) return true;
  const a = version.split('.').map((n) => parseInt(n, 10) || 0);
  const b = min.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return true;
}
