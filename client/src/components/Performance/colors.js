/**
 * @fileoverview Shared rainbow palette for the Performance section. These are
 * the same colours as the "Features Utilized" card on the Dashboard, so the
 * visuals share one identity. Defined once here and reused by the chart, the
 * plan-usage bar, and the refresh spinner.
 */

/** Ordered rainbow colours. */
export const RAINBOW_COLORS = ['#9c27b0', '#d32f2f', '#0288d1', '#fbc02d', '#3f51b5'];

/** Left-to-right rainbow gradient built from RAINBOW_COLORS. */
export const RAINBOW_GRADIENT = `linear-gradient(90deg, ${RAINBOW_COLORS
  .map((c, i) => `${c} ${(i * 100) / (RAINBOW_COLORS.length - 1)}%`)
  .join(', ')})`;

/** SVG gradient element id used to paint the refresh spinner. */
export const RAINBOW_GRADIENT_ID = 'cckiro-rainbow-gradient';
