/**
 * @fileoverview Sample configurations for connecting a program to Kiro over
 * ACP (kiro.dev/docs/acp, /docs/cli/acp). Each sample runs `kiro-cli acp` with
 * the full path, because editors often don't inherit the shell's PATH.
 */

/**
 * The command an editor on this machine should start. Under WSL the editor
 * usually runs on Windows, where the Linux path means nothing, so it goes
 * through wsl.exe.
 * @param {{path?: string, isWSL?: boolean}} env
 * @returns {{command: string, args: string[]}}
 */
function acpCommand({ path, isWSL }) {
  const cli = path || 'kiro-cli';
  return isWSL ? { command: 'wsl.exe', args: ['-e', cli, 'acp'] } : { command: cli, args: ['acp'] };
}

const json = (v) => `${JSON.stringify(v, null, 2)}\n`;

/** Where each editor keeps its configuration, by platform. */
const WHERE = {
  jetbrains: (p) => (p === 'windows' ? '%USERPROFILE%\\.jetbrains\\acp.json' : '~/.jetbrains/acp.json'),
  zed: (p) => (p === 'windows' ? '%APPDATA%\\Zed\\settings.json' : '~/.config/zed/settings.json'),
};

/**
 * The ways to use ACP, each with an editable sample.
 * @param {{path?: string, isWSL?: boolean, platform?: string}} env
 * @returns {Object[]} each { id, label, kind, where, steps } plus one of: sample (a file to paste),
 *   fields ([{id, label, value}] to copy one by one), or start + messages ([{id, title, note, sample}])
 */
export function acpOptions(env) {
  const { command, args } = acpCommand(env);
  const platform = env.isWSL ? 'windows' : env.platform;
  return [
    {
      id: 'jetbrains', label: 'JetBrains IDE', kind: 'IDE',
      where: WHERE.jetbrains(platform),
      steps: ['Open the AI Chat tool window, Settings, Add Custom Agent.', `Paste this into ${WHERE.jetbrains(platform)}.`, 'Pick "Kiro Agent" in the AI Chat mode selector.'],
      language: 'json',
      sample: json({ agent_servers: { 'Kiro Agent': { command, args } } }),
    },
    {
      id: 'zed', label: 'Zed', kind: 'IDE',
      where: WHERE.zed(platform),
      steps: [`Open ${WHERE.zed(platform)} (Zed: Open Settings).`, 'Add agent_servers to it, next to your other settings.', 'Pick "Kiro Agent" in the agent picker of the AI panel.'],
      language: 'json',
      sample: json({ agent_servers: { 'Kiro Agent': { type: 'custom', command, args, env: {} } } }),
    },
    {
      id: 'plugin', label: 'Editor plugin (e.g. VS Code)', kind: 'Plugin',
      where: "the plugin's agent settings",
      steps: [
        'Install an ACP client extension. VS Code has none built in; these are third-party, so check your policy first.',
        'In the extension\'s settings, find "Add agent" or "Custom agent".',
        'Copy the Command and the Arguments below into the matching fields, name it Kiro, then pick it in the extension\'s chat panel.',
      ],
      fields: [
        { id: 'command', label: 'Command', value: command },
        { id: 'args', label: 'Arguments', value: args.join(' ') },
      ],
    },
    {
      id: 'program', label: 'Your own program', kind: 'Program',
      where: 'your program',
      steps: [
        'Your program starts the command below and talks to it through its standard input and output.',
        'It sends the three messages below in order, each as one line of JSON (shown spread out here so you can read them).',
        'Kiro answers each request. Answer any request from Kiro you don\'t support with a JSON-RPC error, so it never waits.',
      ],
      start: `${env.path || 'kiro-cli'} acp`, // a program you write runs where Kiro does, so no wsl.exe
      messages: [
        {
          id: 'initialize', title: '1. Start the connection: initialize',
          note: 'Kiro answers with what it supports. Use optional features only when they are listed there.',
          json: { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }, clientInfo: { name: 'my-program', version: '1.0.0' } } },
        },
        {
          id: 'session', title: '2. Open a session in your project: session/new',
          note: 'Kiro answers with a sessionId. cwd is your project folder; its .kiro settings apply. Workflows stay off in an ACP session until the client turns them on, as below, even when chat.enableWorkflows is on.',
          json: { jsonrpc: '2.0', id: 1, method: 'session/new', params: { cwd: '/path/to/project', mcpServers: [], _meta: { kiro: { settings: { workflows: { enabled: true } } } } } },
        },
        {
          id: 'prompt', title: '3. Send a message: session/prompt',
          note: 'While it works, Kiro sends session/update notifications and may ask session/request_permission before a tool runs. It answers this request when the turn ends.',
          json: { jsonrpc: '2.0', id: 2, method: 'session/prompt', params: { sessionId: '<sessionId from step 2>', prompt: [{ type: 'text', text: 'Explain this codebase' }] } },
        },
      ].map((m) => ({ ...m, sample: json(m.json) })),
    },
  ];
}
