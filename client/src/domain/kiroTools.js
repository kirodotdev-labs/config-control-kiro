/**
 * @fileoverview Kiro CLI V3 built-in tool vocabulary, the single source for
 * every tool picker and hook matcher in the app.
 * Source: https://kiro.dev/docs/tools/ and
 * https://kiro.dev/docs/custom-agents/configuration-reference/ (Oct 2026).
 */

/** Category tags accepted in an agent's `tools` / `excludedTools` fields. */
export const TOOL_TAGS = ['read', 'write', 'shell', 'web', 'subagent'];

/** What each built-in selector gives the agent, for the tools picker. */
export const BUILTIN_SELECTORS = [
  { id: 'read', label: 'Read', detail: 'read files, list folders, search by name and content, code intelligence' },
  { id: 'write', label: 'Write', detail: 'create, edit, append to and delete files' },
  { id: 'shell', label: 'Shell', detail: 'run shell commands' },
  { id: 'web', label: 'Web', detail: 'web search and fetching URLs' },
  // Which agents it may start is chosen in the Sub-agents section, not here.
  { id: 'subagent', label: 'Sub-agents', detail: 'start any agent (one tool per agent)', subagents: true },
  { id: 'invoke_sub_agent', label: 'Any sub-agent', detail: 'start any agent (one general tool)', subagents: true },
  { id: 'knowledge', label: 'Knowledge', detail: 'search indexed knowledge bases (experimental)' },
];

/** Special selectors for the `tools` field. */
export const ALL_TOOLS = '*';
export const ALL_BUILTIN = '@builtin';
export const ALL_MCP = '@mcp';

/**
 * Built-in tools an agent can be given one by one, by ID, with what each does
 * (kiro.dev/docs/tools, "Tool catalog"). knowledge and invoke_sub_agent are
 * checkboxes in the picker, so they aren't listed here.
 */
export const BUILTIN_TOOLS = [
  { id: 'read_file', detail: 'Read one file (part of read)' },
  { id: 'list_directory', detail: 'List a folder (part of read)' },
  { id: 'file_search', detail: 'Find files by path pattern (part of read)' },
  { id: 'grep_search', detail: 'Search file contents with a regex (part of read)' },
  { id: 'code', detail: 'Code intelligence: symbols, signatures, search (read and write)' },
  { id: 'introspect', detail: "Answer questions about Kiro's own features (part of read)" },
  { id: 'fs_write', detail: 'Create or overwrite a file (part of write)' },
  { id: 'fs_append', detail: 'Append to a file (part of write)' },
  { id: 'str_replace', detail: 'Replace text in a file (part of write)' },
  { id: 'delete_file', detail: 'Delete a file (part of write)' },
  { id: 'execute_bash', detail: 'Run a shell command (part of shell)' },
  { id: 'execute_pwsh', detail: 'Run a PowerShell command, on Windows (part of shell)' },
  { id: 'createHook', detail: 'Create a hook from the chat' },
  { id: 'web_fetch', detail: 'Fetch a URL (part of web)' },
  { id: 'remote_web_search', detail: 'Search the web (part of web)' },
  { id: 'disclose_context', detail: 'Load skills and steering on demand' },
];

/**
 * Names Kiro CLI V3 has no tool for, with what to use instead
 * (kiro.dev/docs/tools, "Surface availability").
 */
const NOT_IN_V3 = {
  use_aws: 'use an AWS MCP server', aws: 'use an AWS MCP server', delegate: 'use sub-agents (Sub-agents section)',
  todo: 'not in V3', todo_list: 'not in V3', task: 'not in V3', thinking: 'not in V3', session: 'not in V3',
  goal: 'not in V3', tool_search: 'not in V3', fs_read: 'use read', glob: 'use file_search', grep: 'use grep_search',
  execute_cmd: 'use shell', use_subagent: 'use the Sub-agents section',
};

/**
 * Entries of a tools list that Kiro CLI V3 won't recognise, each with a
 * hint. Tags, IDs, @… selectors, subagent/… and wildcard patterns are fine;
 * an unknown name is still kept, in case Kiro adds it later.
 * @param {string[]} list
 * @param {boolean} [upgraded] the agent was upgraded by Kiro, which keeps the
 *   old names on purpose for 2.x chats (its Kiro CLI V3 card lists them).
 * @returns {{name: string, hint: string}[]}
 */
export function unknownTools(list, upgraded = false) {
  // web_search is how Kiro shows remote_web_search.
  const known = new Set([...TOOL_TAGS, ...BUILTIN_SELECTORS.map((b) => b.id), ...BUILTIN_TOOLS.map((b) => b.id), ...RUNTIME_TOOL_IDS,
    ALL_TOOLS, ALL_BUILTIN, ALL_MCP, 'web_search']);
  return list
    .filter((t) => !known.has(t) && !t.startsWith('@') && !t.startsWith('subagent/') && !/[*?]/.test(t))
    .filter((t) => !(upgraded && NOT_IN_V3[t]))
    .map((t) => ({ name: t, hint: NOT_IN_V3[t] ? `Kiro CLI V3 has no ${t} tool: ${NOT_IN_V3[t]}.` : `Kiro CLI V3 doesn't know a tool called ${t}. It's kept, in case it's new; check the name.` }));
}

/** Runtime tool IDs, as seen by hook matchers (PreToolUse / PostToolUse). */
export const RUNTIME_TOOL_IDS = [
  'read_file', 'list_directory', 'file_search', 'grep_search', 'code',
  'fs_write', 'fs_append', 'str_replace', 'delete_file',
  'execute_bash', 'remote_web_search', 'web_fetch',
  'invoke_sub_agent', 'disclose_context', 'introspect', 'knowledge',
];

/** Whether an agent's `tools` list grants an MCP server (by @server or a wildcard). */
export const grantsServer = (tools, server) =>
  tools.includes(ALL_TOOLS) || tools.includes(ALL_MCP) || tools.includes(`@${server}`);

/** Whether an agent's `tools` list grants a tag or direct built-in ID. */
export const grantsBuiltin = (tools, id) =>
  tools.includes(ALL_TOOLS) || tools.includes(ALL_BUILTIN) || tools.includes(id);
