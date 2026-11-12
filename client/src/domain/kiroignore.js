/**
 * @fileoverview Kiroignore helpers (gitignore syntax; kiro.dev/docs/kiroignore).
 */

/** A starting point for secrets, from Kiro's own example. */
export const KIROIGNORE_TEMPLATE = `# Files Kiro must not read. Same syntax as .gitignore.

# Secrets and credentials
.env
.env.*
!.env.example
*.pem
*.key

# Private folders
secrets/
`;

/** The active patterns: non-empty lines that aren't comments. */
export const ignorePatterns = (text) => (text || '').split(/\r?\n/)
  .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
