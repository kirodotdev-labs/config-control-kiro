/**
 * @fileoverview Saved prompts (kiro.dev/docs/cli/chat/manage-prompts): a
 * Markdown file in prompts/ run in a chat as /<file name>. In V3, text typed
 * after the name fills $ARGUMENTS (all of it) or $1, $2, … (one word each).
 */

/** The prompt's chat command for a file name, e.g. review.md → /review. */
const promptCommand = (fileName) => `/${fileName.replace(/\.md$/i, '')}`;

/**
 * Which argument placeholders a prompt uses.
 * @param {string} text
 * @returns {{all: boolean, positions: number[]}} positions are the $n used, ascending.
 */
export function promptPlaceholders(text) {
  const positions = [...new Set([...text.matchAll(/\$([1-9])\b/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
  return { all: /\$ARGUMENTS\b/.test(text), positions };
}

/**
 * How to run the prompt, with its arguments: "/review <argument 1> <argument 2>".
 * @param {string} fileName
 * @param {{all: boolean, positions: number[]}} used
 */
export function promptUsage(fileName, used) {
  const parts = [promptCommand(fileName)];
  const max = used.positions.length ? Math.max(...used.positions) : 0;
  for (let i = 1; i <= max; i += 1) parts.push(`<argument ${i}>`);
  if (used.all && !max) parts.push('<anything you type>');
  else if (used.all) parts.push('…');
  return parts.join(' ');
}

/** The placeholders Insert offers: $ARGUMENTS, then the next unused $n. */
export function placeholderOptions(used) {
  const next = (used.positions.length ? Math.max(...used.positions) : 0) + 1;
  const out = [{ token: '$ARGUMENTS', label: 'everything typed after the name' }];
  for (let i = 1; i <= Math.min(next, 9); i += 1) out.push({ token: `$${i}`, label: i === 1 ? 'the first word typed after the name' : `word ${i}` });
  return out;
}
