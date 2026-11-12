/**
 * @fileoverview Kiro CLI's code intelligence for a Workspace: the language
 * servers in .kiro/settings/lsp.json. The defaults are the ones Kiro writes
 * with /code init (same names, commands, args and patterns). Install commands
 * are the docs' where they work on every system; Java, C/C++ and Kotlin get one
 * per system (the docs give only macOS or Linux), from each server's own instructions.
 * Source: kiro.dev/docs/tools/code-intelligence.
 */
import { isObject } from './json.js';

/** Kiro's built-in language servers, as /code init writes them, plus how to install each. */
export const LSP_DEFAULTS = {
  typescript: {
    label: 'TypeScript / JavaScript', install: 'npm install -g typescript-language-server typescript',
    entry: { name: 'typescript-language-server', command: 'typescript-language-server', args: ['--stdio'], file_extensions: ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'], request_timeout_secs: 30, project_patterns: ['package.json', 'tsconfig.json'], exclude_patterns: ['**/node_modules/**', '**/dist/**'], multi_workspace: false, initialization_options: { preferences: { disableSuggestions: false } } },
  },
  rust: {
    label: 'Rust', install: 'rustup component add rust-analyzer',
    entry: { name: 'rust-analyzer', command: 'rust-analyzer', args: [], file_extensions: ['.rs'], request_timeout_secs: 60, project_patterns: ['Cargo.toml'], exclude_patterns: ['**/target/**'], multi_workspace: false, initialization_options: { cargo: { buildScripts: { enable: true } }, diagnostics: { enable: true, enableExperimental: true }, workspace: { symbol: { search: { scope: 'workspace' } } } } },
  },
  python: {
    label: 'Python', install: 'pip install pyright',
    entry: { name: 'pyright', command: 'pyright-langserver', args: ['--stdio'], file_extensions: ['.py', '.pyi'], request_timeout_secs: 30, project_patterns: ['pyproject.toml', 'setup.py', 'requirements.txt', 'pyrightconfig.json'], exclude_patterns: ['**/__pycache__/**', '**/venv/**', '**/.venv/**', '**/.pytest_cache/**'], multi_workspace: false, initialization_options: {} },
  },
  go: {
    label: 'Go', install: 'go install golang.org/x/tools/gopls@latest',
    entry: { name: 'gopls', command: 'gopls', args: ['serve'], file_extensions: ['.go'], request_timeout_secs: 30, project_patterns: ['go.mod', 'go.sum'], exclude_patterns: ['**/vendor/**'], multi_workspace: false, initialization_options: { usePlaceholders: true, completeUnimported: true } },
  },
  java: {
    label: 'Java', install: { mac: 'brew install jdtls', linux: 'Download Eclipse JDT LS from https://download.eclipse.org/jdtls/milestones/ and put its bin folder on PATH', windows: 'Download Eclipse JDT LS from https://download.eclipse.org/jdtls/milestones/ and add its bin folder to PATH' },
    entry: { name: 'jdtls', command: 'jdtls', args: [], file_extensions: ['.java'], request_timeout_secs: 60, project_patterns: ['pom.xml', 'build.gradle', 'build.gradle.kts', '.project'], exclude_patterns: ['**/target/**', '**/build/**', '**/.gradle/**'], multi_workspace: false, initialization_options: { settings: { java: { compile: { nullAnalysis: { mode: 'automatic' } }, configuration: { annotationProcessing: { enabled: true } } } } } },
  },
  ruby: {
    label: 'Ruby', install: 'gem install solargraph',
    entry: { name: 'solargraph', command: 'solargraph', args: ['stdio'], file_extensions: ['.rb'], request_timeout_secs: 30, project_patterns: ['Gemfile', 'Rakefile'], exclude_patterns: ['**/vendor/**', '**/tmp/**'], multi_workspace: false, initialization_options: {} },
  },
  cpp: {
    label: 'C / C++', install: { mac: 'brew install llvm', linux: 'sudo apt install clangd', windows: 'winget install LLVM.LLVM  (then add C:\\Program Files\\LLVM\\bin to PATH)' },
    entry: { name: 'clangd', command: 'clangd', args: ['--background-index'], file_extensions: ['.cpp', '.cc', '.cxx', '.c', '.h', '.hpp', '.hxx'], request_timeout_secs: 30, project_patterns: ['CMakeLists.txt', 'compile_commands.json', 'Makefile'], exclude_patterns: ['**/build/**', '**/cmake-build-**/**'], multi_workspace: false, initialization_options: {} },
  },
  kotlin: {
    label: 'Kotlin', install: { mac: 'brew install kotlin-language-server', linux: 'Download it from https://github.com/fwcd/kotlin-language-server/releases and put its bin folder on PATH', windows: 'Download it from https://github.com/fwcd/kotlin-language-server/releases and add its bin folder to PATH' },
    entry: { name: 'kotlin-language-server', command: 'kotlin-language-server', args: [], file_extensions: ['.kt', '.kts'], request_timeout_secs: 60, project_patterns: ['build.gradle', 'build.gradle.kts', 'pom.xml', 'settings.gradle.kts'], exclude_patterns: ['**/build/**', '**/.gradle/**'], multi_workspace: false, initialization_options: {} },
  },
};

/** The fields of one language in lsp.json, with the docs' description of each. */
export const LSP_FIELDS = {
  name: 'Display name for the language server',
  command: 'The program Kiro starts',
  args: 'Command-line arguments (usually --stdio)',
  file_extensions: 'File extensions this server handles',
  file_patterns: 'File names it handles that have no standard extension, e.g. Dockerfile or docker-compose*.yml',
  project_patterns: 'Files that mark a project root, e.g. package.json',
  exclude_patterns: 'Globs to leave out of analysis',
  multi_workspace: 'The server supports several workspace folders',
  initialization_options: 'Options passed to the server when it starts (JSON)',
  request_timeout_secs: 'Seconds to wait for an answer (default 60)',
};

/** lsp.json's languages, or {} when it has none. */
export const lspLanguages = (doc) => (isObject(doc?.languages) ? doc.languages : {});

/** lsp.json for a set of language ids, using Kiro's defaults. */
export function lspFileFor(ids) {
  const languages = {};
  ids.forEach((id) => { if (LSP_DEFAULTS[id]) languages[id] = structuredClone(LSP_DEFAULTS[id].entry); });
  return { languages };
}

/** What's wrong with one language entry, the way Kiro would read it. */
export function lspProblems(entry) {
  const out = [];
  if (!isObject(entry)) return ['Each language must be an object.'];
  if (entry.command !== undefined && (typeof entry.command !== 'string' || !entry.command.trim())) out.push('command must be the program to start.');
  ['args', 'file_extensions', 'file_patterns', 'project_patterns', 'exclude_patterns'].forEach((k) => {
    if (entry[k] !== undefined && (!Array.isArray(entry[k]) || entry[k].some((v) => typeof v !== 'string'))) out.push(`${k} must be a list of text.`);
  });
  if (entry.request_timeout_secs !== undefined && (typeof entry.request_timeout_secs !== 'number' || entry.request_timeout_secs <= 0)) out.push('request_timeout_secs must be a positive number.');
  if (entry.multi_workspace !== undefined && typeof entry.multi_workspace !== 'boolean') out.push('multi_workspace must be true or false.');
  if (entry.initialization_options !== undefined && !isObject(entry.initialization_options)) out.push('initialization_options must be a JSON object.');
  return out;
}

/** The /code commands, from the docs. */
export const CODE_COMMANDS = [
  { cmd: '/code init', what: 'Detect the languages, write .kiro/settings/lsp.json and start the language servers.' },
  { cmd: '/code init -f', what: 'Restart every language server (after editing lsp.json, or if they stopped).' },
  { cmd: '/code status', what: 'Show the Workspace and each language server\u2019s state.' },
  { cmd: '/code overview', what: 'A structure overview of the project (add a folder, or --silent).' },
  { cmd: '/code summary', what: 'Write AGENTS.md, README.md or CONTRIBUTING.md from the code.' },
  { cmd: '/code logs -l ERROR', what: 'Language server logs, for when something doesn\u2019t start.' },
];

/**
 * How to install a server on this computer: the one command for every system, or this system's.
 * @param {string|{mac: string, linux: string, windows: string}} install
 * @param {{platform?: string, isWSL?: boolean}} [info] from the app's system info; WSL counts as Linux.
 */
export function installFor(install, info) {
  if (typeof install === 'string') return install;
  if (info?.platform === 'windows' && !info.isWSL) return install.windows;
  return info?.platform === 'darwin' ? install.mac : install.linux;
}

