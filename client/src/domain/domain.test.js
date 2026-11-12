/**
 * @fileoverview Unit tests for the domain layer (run with `npm test`, Node's
 * built-in test runner; no extra dependencies).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setField, sameJson, parseJson } from './json.js';
import { AGENT_ID_PATTERN } from './agentSpec.js';
import { chatCommand, withDirectory, launchableAgentError } from './launch.js';
import { hookError, hookCount, newHook, triggerInfo, canConfirm, NEW_CONFIRM } from './hooks.js';
import { parseServers, toWsl, setEnabled, setOAuth, redirectUriError, setAutoApprove, approvesAll } from './mcp.js';
import { grantsBuiltin } from './kiroTools.js';
import { togglePolicy } from './permissions.js';
import { versionAtLeast } from './version.js';
import { filterMemories, memoryType, scopeLabel } from './memory.js';

test('setField keeps key order, appends new keys, drops empties', () => {
  const spec = { name: 'a', tools: ['read'], model: 'auto' };
  assert.deepEqual(Object.keys(setField(spec, 'tools', ['x'])), ['name', 'tools', 'model']);
  assert.deepEqual(Object.keys(setField(spec, 'prompt', 'hi')), ['name', 'tools', 'model', 'prompt']);
  assert.deepEqual(Object.keys(setField(spec, 'model', '')), ['name', 'tools']);
  assert.equal(setField(spec, 'absent', ''), spec, 'removing a missing key returns the same object');
  assert.deepEqual(setField(spec, 'tools', [], { keepEmpty: true }).tools, []);
  assert.ok(!sameJson({ a: 1, b: 2 }, { b: 2, a: 1 }), 'reordering is a change');
  assert.ok(parseJson('{').error);
});

test('launch commands always use V3 and reject unsafe agent ids', () => {
  assert.equal(chatCommand(), 'kiro-cli chat --v3');
  assert.equal(chatCommand({ agentId: 'rev', resume: true }), 'kiro-cli chat --v3 --agent rev --resume-picker');
  assert.equal(chatCommand({ cloud: true, resume: true }), 'kiro-cli chat --v3 --cloud', 'a cloud session starts new; it cannot resume');
  assert.equal(chatCommand({ agentId: 'old', v2: true }), 'kiro-cli chat --v2 --agent old');
  assert.equal(chatCommand({ agentId: 'old', v2: true, resume: true, cloud: true }), 'kiro-cli chat --v2 --agent old --resume-picker', '2.x has no cloud sessions');
  assert.equal(withDirectory('~', 'x', false), 'cd ~ && x');
  assert.equal(withDirectory('~/my dir', 'x', false), 'cd ~/"my dir" && x');
  assert.equal(withDirectory('C:\\Users\\me', 'x', true), 'cd C:\\Users\\me; x');
  assert.equal(launchableAgentError('good-name_1.v2'), '');
  assert.ok(launchableAgentError('my agent'));
  assert.ok(!AGENT_ID_PATTERN.test('-flag'), 'ids must not look like flags');
});

test('legacy hook triggers are recognised and counted', () => {
  assert.equal(hookCount({ agentSpawn: [{ command: 'a' }], preToolUse: [{ command: 'b' }] }), 2);
  assert.equal(triggerInfo('agentSpawn').value, 'SessionStart');
  assert.equal(triggerInfo('SessionEnd').value, 'SessionEnd', 'V3 SessionEnd is a known trigger');
  assert.equal(triggerInfo('Manual').value, 'Manual', 'V3 Manual is a known trigger');
});

test('hook validation and unique names', () => {
  assert.equal(hookError({ name: 'a', trigger: 'Stop', action: { type: 'command', command: 'x' } }), '');
  assert.match(hookError({ name: 'a', trigger: 'Stop', action: { type: 'agent' } }), /Prompt/);
  assert.match(hookError({ name: 'a', trigger: 'Nope', action: { type: 'command', command: 'x' } }), /trigger/);
  assert.equal(newHook([{ name: 'new-hook' }]).name, 'new-hook-2');
});

test('pasted MCP servers are accepted in every common shape', () => {
  const want = { git: { command: 'uvx', args: ['git-mcp'] } };
  assert.deepEqual(parseServers('{"mcpServers":{"git":{"command":"uvx","args":["git-mcp"]}}}').servers, want);
  assert.deepEqual(parseServers('"git": {"command": "uvx", "args": ["git-mcp",],},').servers, want);
  assert.match(parseServers('{"x": {"args": []}}').error, /command/);
  assert.equal(parseServers('').error, '');
  assert.deepEqual(toWsl(want).git, { command: 'wsl.exe', args: ['-e', 'uvx', 'git-mcp'] });
  assert.deepEqual(setEnabled({ command: 'a', disabled: true }, true), { command: 'a' });
});

test('builtin grants follow tags and wildcards', () => {
  assert.ok(grantsBuiltin(['*'], 'shell'));
  assert.ok(grantsBuiltin(['@builtin'], 'web'));
  assert.ok(grantsBuiltin(['read'], 'read'));
  assert.ok(!grantsBuiltin(['read'], 'write'));
});

test('findTopLevelKey ignores nested keys of the same name', async () => {
  const { findTopLevelKey } = await import('./jsonRange.js');
  const text = JSON.stringify({ x: { name: 'inner' }, name: 'outer', n: 3 }, null, 2);
  const r = findTopLevelKey(text, 'name');
  assert.equal(text.slice(r.from, r.to), '"name": "outer"');
  assert.equal(text.slice(...Object.values(findTopLevelKey(text, 'n'))), '"n": 3');
  assert.equal(findTopLevelKey(text, 'missing'), null);
});

test('findTopLevelKey follows a key path', async () => {
  const { findTopLevelKey } = await import('./jsonRange.js');
  const text = JSON.stringify({ mcpServers: { git: { command: 'a' }, aws: { command: 'b' } }, git: 1 }, null, 2);
  const r = findTopLevelKey(text, ['mcpServers', 'aws']);
  assert.equal(text.slice(r.from, r.to).replace(/\s+/g, ''), '"aws":{"command":"b"}');
  assert.equal(findTopLevelKey(text, ['mcpServers', 'missing']), null);
  assert.equal(text.slice(...Object.values(findTopLevelKey(text, 'git'))), '"git": 1');
});


test('relationView opens a skill and its group when one of its files is selected', async () => {
  const { relationView } = await import('./relations.js');
  const nodes = [{ id: 'skills', children: [{ id: 'skill:a', children: [{ id: 'skillfile:a/scripts/x.sh' }] }] }, { id: 'hooks', children: [] }];
  const v = relationView(nodes, 'skillfile:a/scripts/x.sh', undefined);
  assert.deepEqual([...v.openGroups].sort(), ['skill:a', 'skills']);
});

test('relationView opens the groups that hold linked rows and dims the rest', async () => {
  const { relationView, rowRelation } = await import('./relations.js');
  const nodes = [
    { id: 'agents', children: [{ id: 'agent:a' }, { id: 'agent:b' }] },
    { id: 'steering', children: [{ id: 'steering:x.md' }] },
    { id: 'skills', children: [{ id: 'skill:s' }] },
    { id: 'mcp' },
  ];
  const view = relationView(nodes, 'agent:a', {
    links: [{ id: 'steering:x.md', via: 'resources' }, { id: 'skill:s', via: 'inherited: skill', inherited: true }], other: [],
  });
  assert.deepEqual([...view.openGroups].sort(), ['agents', 'skills', 'steering']);
  assert.equal(rowRelation(view, 'agent:a', 'agent:a'), 'self');
  assert.equal(rowRelation(view, 'steering:x.md', 'agent:a'), 'linked');
  assert.equal(rowRelation(view, 'skill:s', 'agent:a'), 'inherited');
  assert.equal(rowRelation(view, 'mcp', 'agent:a'), 'muted');
  assert.equal(rowRelation(relationView(nodes, 'agent:a', { links: [], other: [] }), 'mcp', 'agent:a'), undefined);
});

test('settings are grouped, filtered and validated from kiro-cli metadata', async () => {
  const { groupSettings, settingError, settingsErrors, describeValue } = await import('./settings.js');
  const cat = [
    { key: 'api.timeout', description: 'API timeout', type: 'number', group: 'Advanced' },
    { key: 'chat.agentEngine', description: 'Default agent engine', type: 'string', group: 'Chat', choices: [{ value: 'v2' }, { value: 'v3' }] },
    { key: 'compaction.pct', description: 'Percent', type: 'number', group: 'Compaction', min: 0, max: 100 },
    { key: 'chat.skimKey', description: 'Key', type: 'char', group: 'Keybindings' },
  ];
  assert.deepEqual(groupSettings(cat).map((g) => g.name), ['Chat', 'Keybindings', 'Compaction', 'Advanced']);
  assert.deepEqual(groupSettings(cat, { query: 'engine' }).map((g) => g.settings[0].key), ['chat.agentEngine']);
  assert.equal(groupSettings(cat, { onlySet: true, values: { 'api.timeout': 5 } }).length, 1);
  assert.equal(settingError(cat[1], 'v3'), '');
  assert.match(settingError(cat[1], 'v9'), /one of: v2, v3/);
  assert.match(settingError(cat[2], 150), /at most 100/);
  assert.match(settingError(cat[3], 'ab'), /single character/);
  assert.deepEqual(Object.keys(settingsErrors(cat, { 'compaction.pct': -1, unknown: 'x' })), ['compaction.pct']);
  assert.equal(describeValue(true), 'on');
});

test('chats & usage helpers', async () => {
  const s = await import('./sessions.js');
  assert.equal(s.formatCredits(0.4213), '0.42');
  assert.equal(s.formatCredits(8.04), '8');
  assert.equal(s.formatCredits(2349.5), '2,350');
  assert.equal(s.formatCredits(undefined), '—');
  const now = Date.parse('2026-10-26T12:00:00Z');
  assert.equal(s.timeAgo('2026-10-26T11:55:00Z', now), '5 min ago');
  assert.equal(s.timeAgo('2026-10-25T11:00:00Z', now), '1 day ago');
  assert.equal(s.timeAgo('2026-10-22T11:00:00Z', now), '4 days ago');
  const ws = [{ name: 'proj', path: '/w/proj' }, { name: 'api', path: 'C:\\Code\\API' }];
  assert.deepEqual(s.folderLabel('/w/proj', ws), { label: 'proj', workspace: true });
  assert.deepEqual(s.folderLabel('/w/proj/sub/x', ws), { label: 'proj/sub/x', workspace: true });
  assert.deepEqual(s.folderLabel('c:\\code\\api', ws), { label: 'api', workspace: true });
  assert.deepEqual(s.folderLabel('/home/me/other', ws), { label: 'other', workspace: false });
  assert.deepEqual(s.folderLabel('/w/project', ws), { label: 'project', workspace: false }, 'a sibling folder with the same prefix is not inside');
  const chats = [
    { id: 'a', title: 'Fix login', folder: '/w/proj', agent: 'reviewer', running: true, contextPct: 85 },
    { id: 'b', title: 'child', folder: '/w/proj', agent: 'reviewer', parentId: 'a' },
    { id: 'c', title: 'Docs', folder: '/x', contextPct: 10 },
  ];
  assert.deepEqual(s.chatCounts(chats), { all: 2, running: 1, full: 1, bookmarked: 0, branches: 0, subagents: 1, empty: 0, engines: { undefined: 2 } });
  assert.deepEqual(s.filterChats(chats).map((c) => c.id), ['a', 'c']);
  assert.deepEqual(s.filterChats(chats, { subagents: true, agent: 'reviewer' }).map((c) => c.id), ['a', 'b']);
  assert.deepEqual(s.filterChats(chats, { agent: 'kiro_default' }).map((c) => c.id), ['c']);
  assert.deepEqual(s.filterChats(chats, { show: 'full' }).map((c) => c.id), ['a']);
  assert.deepEqual(s.filterChats(chats, { query: 'docs' }).map((c) => c.id), ['c']);
  assert.deepEqual(s.filterChats(chats, { folder: '/w/proj' }).map((c) => c.id), ['a']);
  assert.equal(s.agentLabel('kiro_default'), 'Default agent');
  const advice = s.agentAdvice({ chats: 3, credits: 200, mainModel: 'opus', mainRate: 2, fullChats: 1 });
  assert.deepEqual(advice.map((a) => a.id), ['model', 'context']);
  assert.match(advice[0].text, /about 50% fewer/);
  assert.deepEqual(s.agentAdvice({ chats: 10, credits: 5, mainRate: 1, fullChats: 1 }), []);
  assert.deepEqual(s.barHeights([{ credits: 0 }, { credits: 5 }, { credits: 10 }]), [0, 50, 100]);
});

test('chat tags, engines and empty chats', async () => {
  const s = await import('./sessions.js');
  const chats = [
    { id: 'a', title: 'Fix login', folder: '/w', engine: 'v2', tags: ['client-x', 'urgent'] },
    { id: 'b', title: '(no title)', folder: '/w', engine: 'v2', empty: true, tags: [] },
    { id: 'c', title: 'Docs', folder: '/w', engine: 'v3', tags: ['client-x'] },
    { id: 'd', title: 'Old', folder: '/w', engine: 'classic', tags: [] },
  ];
  const c = s.chatCounts(chats);
  assert.equal(c.all, 3); assert.equal(c.empty, 1);
  assert.deepEqual(c.engines, { v2: 1, v3: 1, classic: 1 });
  assert.deepEqual(s.chatCounts(chats, { emptyOnly: true }).engines, { v2: 1 });
  assert.deepEqual(s.filterChats(chats).map((x) => x.id), ['a', 'c', 'd'], 'empty chats are hidden by default');
  assert.deepEqual(s.filterChats(chats, { emptyOnly: true }).map((x) => x.id), ['b'], 'the empty view shows only empty chats');
  assert.deepEqual(s.filterChats(chats, { engine: 'v3' }).map((x) => x.id), ['c']);
  assert.deepEqual(s.filterChats(chats, { query: '#client-x' }).map((x) => x.id), ['a', 'c']);
  assert.deepEqual(s.filterChats(chats, { query: '#Client-X #urgent' }).map((x) => x.id), ['a']);
  assert.deepEqual(s.filterChats(chats, { query: '#client' }).map((x) => x.id), [], '# matches whole tags only');
  assert.deepEqual(s.filterChats(chats, { query: 'urgent' }).map((x) => x.id), ['a'], 'plain words also match tags');
  assert.deepEqual(s.filterChats(chats, { query: 'docs client' }).map((x) => x.id), ['c'], 'every word must match');
  assert.deepEqual(s.filterChats(chats, { tag: 'urgent' }).map((x) => x.id), ['a']);
  assert.deepEqual(s.tagCounts(chats), [{ tag: 'client-x', count: 2 }, { tag: 'urgent', count: 1 }]);
  assert.equal(s.normalizeTag('#Client X'), 'client-x');
  assert.equal(s.normalizeTag('  a/b '), 'ab');
  assert.equal(s.normalizeTag('###'), '');
});

test('subagent chats nest under their parent; delete rules', async () => {
  const s = await import('./sessions.js');
  const chats = [
    { id: 'p', title: 'parent', updatedAt: '2026-10-05', engine: 'v2' },
    { id: 'x', title: 'other', updatedAt: '2026-10-04', engine: 'v2' },
    { id: 'c2', parentId: 'p', updatedAt: '2026-10-03', engine: 'v2' },
    { id: 'c1', parentId: 'p', updatedAt: '2026-10-02', engine: 'v2' },
    { id: 'g', parentId: 'c1', updatedAt: '2026-10-02T01', engine: 'v2' },
    { id: 'orphan', parentId: 'gone', updatedAt: '2026-10-01', engine: 'v2' },
  ];
  const kids = s.childrenByParent(chats);
  assert.deepEqual(kids.get('p').map((c) => c.id), ['c1', 'c2']);
  const ids = (rows) => rows.map((r) => `${r.chat.id}:${r.depth}`).join(' ');
  const top = s.filterChats(chats);
  assert.equal(ids(s.nestChats(top, kids)), 'p:0 x:0', 'children hidden by default (orphan has a parentId too)');
  assert.equal(ids(s.nestChats(top, kids, { expanded: new Set(['p']) })), 'p:0 c1:1 c2:1 x:0', 'one parent expanded');
  const all = s.filterChats(chats, { subagents: true });
  assert.equal(ids(s.nestChats(all, kids, { allChildren: true })), 'p:0 c1:1 g:2 c2:1 x:0 orphan:0', 'all children nest; orphans keep their place');
  assert.deepEqual(s.withSubagentLinks(all, kids).map((c) => c.id), ['p', 'c2', 'c1', 'g', 'orphan'], 'the subagent view drops chats without subagent links');
  assert.equal(s.deleteBlocker({ running: true }).startsWith('This chat is open'), true);
  assert.equal(s.deleteBlocker({ engine: 'v3' }), '', 'a V3 chat is deleted in Kiro\'s dashboard, not blocked');
  assert.equal(s.deletedInKiro({ engine: 'v3' }), true);
  assert.equal(s.deletedInKiro({ engine: 'v2' }), false);
  assert.equal(s.deleteBlocker({ engine: 'v2' }), '');
});

test('kiroignore patterns', async () => {
  const { ignorePatterns, KIROIGNORE_TEMPLATE } = await import('./kiroignore.js');
  assert.deepEqual(ignorePatterns('# c\n\n.env\n  *.pem \n!keep.txt\r\n'), ['.env', '*.pem', '!keep.txt']);
  assert.ok(ignorePatterns(KIROIGNORE_TEMPLATE).includes('!.env.example'));
});

test('sandbox: keys and workspace can only tighten', async () => {
  const s = await import('./sandbox.js');
  assert.deepEqual(s.sandboxProblems({}), []);
  assert.deepEqual(s.sandboxProblems({ enabled: true, networkAccess: 'COMMON_DEPENDENCIES', mcpSandboxing: true }), []);
  assert.match(s.sandboxProblems({ enabled: true, networkAccess: 'open' })[0], /case-sensitive/);
  assert.match(s.sandboxProblems({ networkAccess: 'DEFAULT_BLOCKED' })[0], /"enabled" is required/);
  const g = { enabled: true, networkAccess: 'COMMON_DEPENDENCIES', mcpSandboxing: true };
  assert.equal(s.sandboxProblems({ enabled: true, networkAccess: 'DEFAULT_BLOCKED' }, g).length, 0, 'tightening is fine');
  const loose = s.sandboxProblems({ enabled: false, networkAccess: 'DEFAULT_ALLOWED', mcpSandboxing: false }, g);
  assert.equal(loose.length, 3);
  assert.deepEqual(s.allowedModes(g).map((m) => m.value), ['DEFAULT_BLOCKED', 'COMMON_DEPENDENCIES']);
  assert.equal(s.allowedModes({ enabled: false }).length, 3, 'an inactive Global policy limits nothing');
});

test('reasoning effort in chat.modelDefaults', async () => {
  const e = await import('./effort.js');
  assert.equal(e.effortField('claude-opus-5.5'), 'output_config');
  assert.equal(e.effortField('gpt-5.6-sol'), 'reasoning');
  assert.ok(e.supportsEffort('claude-sonnet-5') && !e.supportsEffort('auto'));
  let d = e.withEffort(undefined, 'claude-opus-5.5', 'high');
  assert.deepEqual(d, { 'claude-opus-5.5': { output_config: { effort: 'high' } } });
  d = e.withEffort(d, 'gpt-5.6-sol', 'max');
  assert.deepEqual(d['gpt-5.6-sol'], { reasoning: { effort: 'max' } });
  const keep = { 'claude-opus-4.8': { thinking: { type: 'adaptive' }, output_config: { effort: 'low', max_tokens: 4000 } } };
  assert.deepEqual(e.withEffort(keep, 'claude-opus-4.8', ''), { 'claude-opus-4.8': { thinking: { type: 'adaptive' }, output_config: { max_tokens: 4000 } } }, 'other fields kept');
  assert.equal(e.effortOf(keep, 'claude-opus-4.8'), 'low');
  assert.equal(e.withEffort({ 'claude-x': { output_config: { effort: 'low' } } }, 'claude-x', ''), undefined, 'empty means remove the setting');
});

test('changing a hook trigger keeps or drops the matcher', async () => {
  const { withTrigger } = await import('./hooks.js');
  const h = { name: 'x', trigger: 'PostFileSave', matcher: '\\.ts$' };
  assert.equal(withTrigger(h, 'PostFileCreate').matcher, '\\.ts$', 'file to file keeps it');
  assert.equal(withTrigger(h, 'SessionEnd').matcher, undefined, 'dropped for a trigger without a matcher');
  assert.equal(withTrigger(h, 'PreToolUse').matcher, undefined, 'a file regex is not a tool matcher');
  assert.equal(withTrigger({ trigger: 'PreToolUse', matcher: 'shell' }, 'PostToolUse').matcher, 'shell');
});

test('plan forecast and overage advice', async () => {
  const p = await import('./plan.js');
  const now = new Date(2026, 9, 29, 12);
  const per = p.billingPeriod('2026-11-01');
  assert.equal(per.start.getMonth(), 9); assert.equal(per.start.getDate(), 1);
  assert.equal(p.billingPeriod('2026-03-31').start.getDate(), 28, 'clamped to a short month');
  const power = { name: 'KIRO POWER', resetsOn: '2026-11-01', used: 4287.14, limit: 10000, hasLimit: true, managed: true, overages: { enabled: true, credits: 0 } };
  const fc = p.forecast(power, now);
  assert.ok(fc.perDay > 150 && fc.perDay < 155 && fc.projected < 10000 && fc.status === 'ok', JSON.stringify(fc));
  assert.equal(p.overageAdvice(power, fc).kind, 'overage-on');
  assert.match(p.overageAdvice(power, fc).body, /\$0\.04 per credit, billed to your organization/);
  const heavy = { ...power, used: 9600 };
  const fh = p.forecast(heavy, now);
  assert.equal(fh.status, 'over');
  assert.ok(fh.runOutOn < new Date(2026, 10, 1));
  assert.match(p.overageAdvice(heavy, fh).body, /extra credits \(\$\d+\.\d\d\)/);
  const used = { ...power, used: 10250, overages: { enabled: true, credits: 250 } };
  assert.match(p.overageAdvice(used, p.forecast(used, now)).title, /250 credits over your plan, about \$10\.00/);
  const off = { ...heavy, overages: { enabled: false, credits: 0 } };
  const a = p.overageAdvice(off, p.forecast(off, now));
  assert.equal(a.kind, 'overage-off'); assert.equal(a.tone, 'warning');
  assert.match(a.body, /ask your Kiro administrator to turn on Overages/);
  assert.equal(p.overageAdvice({ ...off, used: 10000 }, p.forecast({ ...off, used: 10000 }, now)).tone, 'error');
  assert.match(p.overageAdvice({ ...off, managed: false }, fh).body, /buy add-on credits/);
  assert.equal(p.overageAdvice({ name: 'KIRO FREE', free: true, resetsOn: '2026-11-01', used: 10, limit: 50, hasLimit: true }, null).kind, 'free');
  assert.equal(p.overageAdvice({ name: 'KIRO PRO', resetsOn: '2026-11-01', used: 10, limit: 1000, hasLimit: true }, null).kind, 'addon');
  assert.equal(p.forecast({ ...power, resetsOn: '' }, now), null);
  assert.equal(p.forecast(power, new Date(2026, 9, 1, 6)).perDay, null, 'no pace on the first day');
  assert.equal(p.localSince([{ date: '2026-09-30', credits: 5 }, { date: '2026-10-01', credits: 2 }, { date: '2026-10-29', credits: 3 }], per.start), 5);
  assert.equal(p.planLabel('KIRO PRO+'), 'Kiro Pro+');
});

test('agent knowledge bases', async () => {
  const k = await import('./knowledge.js');
  const blank = k.formFromEntry();
  assert.deepEqual(Object.keys(k.formErrors(blank)), ['name', 'folder']);
  const form = { ...blank, name: 'docs', folder: '/w/docs', include: ['**/*.md'] };
  assert.deepEqual(k.entryFromForm(form), { type: 'knowledgeBase', source: 'file:///w/docs', name: 'docs', include: ['**/*.md'] }, 'only non-default fields are written');
  const prev = { type: 'knowledgeBase', source: 'file:///old', name: 'docs', indexType: 'fast', futureKey: 1 };
  assert.deepEqual(k.entryFromForm({ ...k.formFromEntry(prev), autoUpdate: true }, prev),
    { type: 'knowledgeBase', source: 'file:///old', futureKey: 1, name: 'docs', indexType: 'fast', autoUpdate: true }, 'unknown fields kept');
  assert.match(k.formErrors({ ...form, name: 'Docs' }, [{ name: 'docs' }]).name, /already has/);
  assert.equal(k.describeEntry({ source: 'file:///d', include: ['*.md'], autoUpdate: true }), '/d · best · re-indexes on start · only *.md');
  assert.ok(k.canSearchKnowledge(['read', 'knowledge']) && k.canSearchKnowledge(['@builtin']) && !k.canSearchKnowledge(['read', 'write']));
  assert.equal(k.absoluteFolder('docs', '/w/proj'), '/w/proj/docs');
  assert.equal(k.absoluteFolder('C:\\x', '/w'), 'C:\\x');
  assert.equal(k.formatBytes(1400000), '1.4 MB');
  assert.ok(k.isKnowledgeBase(prev) && !k.isKnowledgeBase('file://x'));
  assert.deepEqual(k.effectiveDefaultAgent(undefined, undefined), { agent: 'kiro_default', from: 'kiro' });
  assert.deepEqual(k.effectiveDefaultAgent('g', undefined), { agent: 'g', from: 'global' });
  assert.deepEqual(k.effectiveDefaultAgent('g', 'w'), { agent: 'w', from: 'workspace' });
  assert.equal(k.knowledgeEnabled(undefined, undefined), true, 'on by default in V3');
  assert.equal(k.knowledgeEnabled(false, undefined), false);
  assert.equal(k.knowledgeEnabled(false, true), true, 'a Workspace setting wins');
});

test('the group holding the selection stands in for it', async () => {
  const { relationView, rowRelation } = await import('./relations.js');
  const nodes = [{ id: 'agents', children: [{ id: 'agent:a' }, { id: 'agent:b' }] }, { id: 'steering', children: [{ id: 'steering:x.md' }] }, { id: 'mcp' }];
  const view = relationView(nodes, 'agent:a', { links: [{ id: 'steering:x.md', via: 'resources' }], other: [] });
  assert.equal(view.selectedGroup, 'agents');
  assert.equal(rowRelation(view, 'agents', 'agent:a'), undefined, 'the selected agent\'s group is never dimmed');
  assert.equal(rowRelation(view, 'mcp', 'agent:a'), 'muted');
  assert.equal(relationView(nodes, 'mcp', { links: [{ id: 'agent:a' }], other: [] }).selectedGroup, undefined, 'a top-level item has no group');
});

test('context size dots', async () => {
  const { contextDots, relationView, rowRelation } = await import('./relations.js');
  const dots = contextDots([
    { id: 'big', context: { tokens: 15000 } },
    { id: 'quarter', context: { tokens: 3750 } },
    { id: 'none', context: { tokens: 0 } },
    { id: 'mcp', context: { tokens: 70, tools: 2 }, mcp: true },
    { id: 'new', context: { unmeasured: true }, mcp: true },
    { id: 'hook' },
  ]);
  assert.equal(dots.get('big').r, 8, 'the largest gets the largest dot');
  assert.equal(dots.get('quarter').r, 5.5, 'area follows tokens: a quarter of the tokens, half the extra radius');
  assert.equal(dots.get('none').r, 3);
  assert.ok(dots.get('mcp').r < dots.get('quarter').r);
  assert.ok(dots.get('new').ring && !dots.get('big').ring);
  assert.equal(dots.has('hook'), false, 'nothing sent, no dot');
  assert.equal(dots.get('big').title, '15,000 tokens with every message.');
  assert.match(dots.get('mcp').title, /^Up to 70 tokens with every message: the definitions of 2 tools\. In V3 chats, Tool Search/);
  assert.equal(dots.get('new').title, 'Measuring: listing its tools now.');
  assert.match(contextDots([{ id: 'x', context: { unmeasured: true, problem: 'command not found' } }]).get('x').title, /^Couldn't list its tools.*command not found$/);
  assert.equal(contextDots([{ id: 'a', context: { unmeasured: true } }]).get('a').r, 5.5, 'only rings: no division by zero');
  const view = relationView([], 'agent:a', { links: [{ id: 'mcpserver:web', unused: true }, { id: 'steering:a.md', context: { tokens: 5 } }], other: [] });
  assert.equal(rowRelation(view, 'mcpserver:web', 'agent:a'), 'unused');
  assert.equal(view.linked.get('steering:a.md').context.tokens, 5);
});

test('agent context breakdown and suggestions', async () => {
  const { agentContext, contextSuggestions, shortTokens } = await import('./context.js');
  const names = new Map([['steering:big.md', 'big.md'], ['mcpserver:docs', 'docs'], ['prompts:a.md', 'a.md'], ['skill:x', 'x'], ['mcpserver:off', 'off']]);
  const ctx = agentContext({
    links: [
      { id: 'steering:big.md', via: 'inherited: always steering', inherited: true, context: { tokens: 15000 } },
      { id: 'mcpserver:docs', via: 'MCP server, defined in mcp.json', context: { tokens: 60000, tools: 20, toolsTotal: 20, from: 'mcp.json' } },
      { id: 'prompts:a.md', via: 'prompt', context: { tokens: 300 } },
      { id: 'skill:x', via: 'inherited: skill', inherited: true },
      { id: 'mcpserver:off', via: "MCP server, defined in mcp.json. Turned off: Kiro doesn't start it", unused: true },
      { id: 'hooks:h.json', via: 'applies to every agent: hook file', inherited: true },
    ],
    other: [
      { label: 'MCP server own', via: "MCP server, defined in this agent's own mcpServers", context: { unmeasured: true, from: 'agent', problem: 'command not found' } },
      { label: 'file:///x/docs', via: 'knowledge base docs', note: 'file not found' },
    ],
  }, names);
  assert.equal(ctx.total, 75300);
  assert.deepEqual(ctx.items.map((i) => i.name), ['docs', 'big.md', 'a.md', 'own'], 'biggest first; an unmeasured server last');
  assert.deepEqual(ctx.kinds.map((k) => [k.id, k.tokens, k.count]), [['mcp', 60000, 2], ['steering', 15000, 1], ['prompt', 300, 1]]);
  assert.equal(ctx.items[0].source, 'from mcp.json, like the default agent');
  assert.equal(ctx.items[3].ring, true); assert.equal(ctx.items[3].problem, 'command not found'); assert.equal(ctx.unmeasured, 1);
  assert.deepEqual(ctx.notSent.map((n) => n.name), ['x', 'off', 'file:///x/docs'], 'hooks are rules, not content');
  assert.match(ctx.notSent[2].reason, /^Knowledge base/);
  const rel = agentContext({ links: [], other: [{ label: 'file://README.md', via: 'resources', note: 'relative to the folder Kiro starts in' }, { label: '/x.md', via: 'resources', note: 'file not found' }] }, names);
  assert.deepEqual(rel.notSent.map((n) => n.reason), ['Sent by Kiro, but not counted here: its path depends on the folder Kiro starts in.', 'Not sent: file not found.']);
  const ids = contextSuggestions(ctx, 200000).map((s) => s.id);
  assert.deepEqual(ids, ['heavy', 'mcp:mcpserver:docs', 'steer:steering:big.md', 'toolsearch']);
  assert.match(contextSuggestions(ctx, 200000)[0].text, /^38% of the context window/);
  assert.deepEqual(contextSuggestions(agentContext(undefined, names)), []);
  assert.deepEqual([840, 3249, 46210].map(shortTokens), ['840', '3.2K', '46K']);
});

test('sub-agent access the V3 way', async () => {
  const s = await import('./subagents.js');
  assert.deepEqual(s.subagentTargets(['read', 'subagent/reviewer', 'subagent/tester']), ['reviewer', 'tester']);
  assert.deepEqual(s.subagentMode(['read']), { mode: 'none' });
  assert.deepEqual(s.subagentMode(['read', 'subagent/reviewer']), { mode: 'some' });
  assert.deepEqual(s.subagentMode(['subagent/reviewer', 'subagent']), { mode: 'any', because: 'subagent' }, 'the tag wins over named agents');
  assert.deepEqual(s.subagentMode(['invoke_sub_agent']), { mode: 'any', because: 'invoke_sub_agent' });
  assert.deepEqual(s.subagentMode(['@builtin', 'subagent/x']), { mode: 'any', because: '@builtin' });
  assert.deepEqual(s.setSubagentMode(['read', 'subagent', 'invoke_sub_agent', 'subagent/old'], 'some', ['reviewer']), ['read', 'subagent/reviewer'],
    'only these: named agents, no broad entries');
  assert.deepEqual(s.setSubagentMode(['read', 'subagent/old', 'invoke_sub_agent'], 'any'), ['read', 'subagent'], 'any agent: the tag only');
  assert.deepEqual(s.setSubagentMode(['read', 'subagent', 'subagent/old'], 'none'), ['read']);
  assert.deepEqual(s.setSubagentMode(['*', 'subagent/old'], 'none'), ['*'], '* is left to Tools');
  const spec = { name: 'a', permissions: { rules: [{ capability: 'shell', match: ['git *'], effect: 'allow' }] } };
  const trusted = s.setTrustedSubagents(spec, ['reviewer']);
  assert.deepEqual(trusted.permissions.rules[1], { capability: 'subagent', effect: 'allow', match: ['reviewer'] });
  assert.deepEqual(s.trustedSubagents(trusted.permissions), ['reviewer']);
  assert.deepEqual(s.setTrustedSubagents(trusted, []).permissions, spec.permissions, 'clearing removes only that rule');
  assert.equal('permissions' in s.setTrustedSubagents({ name: 'b', permissions: { rules: [{ capability: 'subagent', effect: 'allow', match: ['x'] }] } }, []), false);
});

test('the engine new chats start with', async () => {
  const { effectiveEngine } = await import('./settings.js');
  assert.equal(effectiveEngine({}, '2.34.2'), 'v2', "before 3.0, Kiro's default is 2.x");
  assert.equal(effectiveEngine({}, '3.0.0'), 'v3', 'from 3.0, Kiro starts V3');
  assert.equal(effectiveEngine({ 'chat.agentEngine': 'v3' }, '2.34.2'), 'v3');
  assert.equal(effectiveEngine({ 'chat.agentEngine': 'v2' }, '3.1.0'), 'v2', 'a saved choice wins');
  const { GLOBAL_ONLY } = await import('./settings.js');
  assert.ok(GLOBAL_ONLY.has('chat.agentEngine') && GLOBAL_ONLY.has('memory.mode') && !GLOBAL_ONLY.has('chat.defaultModel'));
});

test('Kiro CLI 2.x formats (domain/v2.js)', async () => {
  const v2 = await import('./v2.js');
  assert.equal(v2.hasV2Subagents({ toolsSettings: { subagent: { availableAgents: ['x'] } } }), true);
  assert.equal(v2.hasV2Subagents({ tools: ['subagent/x'] }), false);
  assert.equal(v2.isV2Hooks({ agentSpawn: [] }), true);
  assert.equal(v2.isV2Hooks([]), false);
  assert.equal(v2.v2HookCount({ agentSpawn: [{}], stop: [{}, {}] }), 3);
  assert.equal(v2.v3Trigger('preToolUse'), 'PreToolUse');
  assert.equal(v2.v3Trigger('PreToolUse'), 'PreToolUse');
});

test('permission presets: version check and toggling', () => {
  assert.equal(versionAtLeast('2.34.2', '2.36'), false);
  assert.equal(versionAtLeast('2.36.0', '2.36'), true);
  assert.equal(versionAtLeast('2.100.1', '2.36'), true);
  assert.equal(versionAtLeast('3.0.0', '2.36'), true);
  assert.equal(versionAtLeast(undefined, '2.36'), true);
  assert.deepEqual(togglePolicy(['future-x'], 'allow-all', true), ['future-x', 'allow-all']);
  assert.deepEqual(togglePolicy(['allow-all'], 'allow-all', true), ['allow-all']);
  assert.deepEqual(togglePolicy(['future-x', 'allow-all'], 'allow-all', false), ['future-x']);
});

test('memory labels and search', () => {
  assert.equal(memoryType('USER_PREFERENCE').label, 'Preference');
  assert.equal(memoryType('SEMANTIC').label, 'Fact');
  assert.equal(memoryType('NEW_KIND').label, 'Other');
  assert.equal(scopeLabel('Global'), 'Global');
  assert.equal(scopeLabel('repo:github/acme/shop'), 'acme/shop');
  assert.equal(scopeLabel('repo:gitlab/group/sub/proj'), 'group/sub/proj');
  assert.equal(scopeLabel('repo:gitfarm/gitfarm/MyPackage'), 'MyPackage');
  const list = [{ title: 'Conventional Commits', summary: 'Use docs(scope): style' }, { title: 'Seed the DB', summary: 'before tests' }];
  assert.equal(filterMemories(list, '').length, 2);
  assert.deepEqual(filterMemories(list, 'commits DOCS').map((m) => m.title), ['Conventional Commits']);
  assert.equal(filterMemories(list, 'nothing').length, 0);
});

test('MCP sign-in and auto-approve', () => {
  let cfg = setOAuth({ url: 'https://x' }, 'clientId', 'abc');
  assert.deepEqual(cfg.oauth, { clientId: 'abc' });
  cfg = setOAuth(cfg, 'oauthScopes', ['files:read']);
  assert.deepEqual(setOAuth(setOAuth(cfg, 'clientId', ''), 'oauthScopes', []), { url: 'https://x' }, 'an empty block is removed');
  assert.equal(redirectUriError(''), '');
  assert.equal(redirectUriError('http://localhost:7778/oauth/callback'), '');
  assert.equal(redirectUriError('127.0.0.1:7778'), '');
  assert.equal(redirectUriError(':7778'), '');
  assert.match(redirectUriError('https://localhost:7778/cb'), /http/);
  assert.match(redirectUriError('http://example.com:7778/cb'), /127\.0\.0\.1 or localhost/);
  assert.match(redirectUriError('http://localhost/cb'), /port/);
  assert.match(redirectUriError('http://localhost:7778/cb?x=1'), /query/);
  let s = setAutoApprove({ command: 'x' }, 'search', true);
  assert.deepEqual(s.autoApprove, ['search']);
  assert.equal(approvesAll(s), false);
  s = setAutoApprove(s, '*', true);
  assert.equal(approvesAll(s), true);
  assert.deepEqual(setAutoApprove(setAutoApprove(s, '*', false), 'search', false), { command: 'x' });
});

test('hook compaction triggers and Stop confirmations', () => {
  assert.equal(triggerInfo('PreCompact').since, '3.1.0');
  assert.equal(triggerInfo('PostCompact').matcher, null);
  const stop = { name: 'submit', trigger: 'Stop', action: { type: 'command', command: './submit.sh' } };
  assert.equal(canConfirm(stop), true);
  assert.equal(canConfirm({ ...stop, trigger: 'PostToolUse' }), false);
  assert.equal(canConfirm({ ...stop, action: { type: 'agent', prompt: 'x' } }), false);
  assert.equal(hookError({ ...stop, confirm: NEW_CONFIRM }), '');
  assert.equal(hookError({ ...stop, confirm: { question: '', options: NEW_CONFIRM.options } }), 'The confirmation needs a question');
  assert.equal(hookError({ ...stop, confirm: { question: 'q', options: [] } }), 'The confirmation needs at least one option');
  assert.match(hookError({ ...stop, confirm: { question: 'q', options: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] } }), /used twice/);
  assert.equal(hookError({ ...stop, trigger: 'PostToolUse', confirm: { bad: 1 } }), '', 'a confirm Kiro ignores is not an error');
});

test('steering front matter', async () => {
  const st = await import('./steering.js');
  const plain = '# Rules\nUse tabs.\n';
  assert.equal(st.parseFrontMatter(plain).fields.inclusion, 'always');
  let t = st.setFrontMatter(plain, 'inclusion', 'fileMatch');
  t = st.setFrontMatter(t, 'fileMatchPattern', ['**/*.ts', '**/*.tsx']);
  assert.equal(t, '---\ninclusion: fileMatch\nfileMatchPattern: ["**/*.ts", "**/*.tsx"]\n---\n# Rules\nUse tabs.\n');
  assert.deepEqual(st.parseFrontMatter(t).fields.fileMatchPattern, ['**/*.ts', '**/*.tsx']);
  t = st.setFrontMatter(t, 'fileMatchPattern', ['components/**/*.tsx']);
  assert.match(t, /fileMatchPattern: "components\/\*\*\/\*\.tsx"\n/);
  const block = '---\ninclusion: fileMatch\nfileMatchPattern:\n  - "*.go"\n  - "*.mod"\nowner: me\n---\nbody';
  assert.deepEqual(st.parseFrontMatter(block).fields.fileMatchPattern, ['*.go', '*.mod']);
  const auto = st.setFrontMatter(st.setFrontMatter(st.setFrontMatter(block, 'inclusion', 'auto'), 'name', 'api-design'), 'description', 'REST API rules: use when editing endpoints');
  assert.equal(auto, '---\ninclusion: auto\nfileMatchPattern:\n  - "*.go"\n  - "*.mod"\nowner: me\nname: api-design\ndescription: "REST API rules: use when editing endpoints"\n---\nbody');
  assert.equal(st.parseFrontMatter(auto).fields.description, 'REST API rules: use when editing endpoints');
  assert.match(st.setFrontMatter(auto, 'fileMatchPattern', []), /^---\ninclusion: auto\nowner: me\n/, 'unknown keys are kept');
  assert.equal(st.setFrontMatter('---\ninclusion: manual\n---\nbody', 'inclusion', 'always'), 'body', 'an empty front matter is removed');
  assert.equal(st.frontMatterError({ inclusion: 'auto', fileMatchPattern: [], name: 'x', description: '' }), 'Auto inclusion needs a name and a description');
  assert.equal(st.frontMatterError({ inclusion: 'fileMatch', fileMatchPattern: [], name: '', description: '' }), 'Add at least one file pattern');
  assert.equal(st.frontMatterError({ inclusion: 'manual', fileMatchPattern: [], name: '', description: '' }), '');
});

test('Kiro CLI V3 card: automatic upgrade and status', async () => {
  const v2 = await import('./v2.js');
  assert.equal(v2.autoUpgrades({}, '3.1.0'), true, 'unset: Kiro upgrades on a V3 start');
  assert.equal(v2.autoUpgrades({ 'chat.enableAutoAgentUpgrade': false }, '3.1.0'), false);
  assert.equal(v2.autoUpgrades({}, '2.34.2'), false, 'before 2.37 an unset setting did nothing');
  assert.equal(v2.v3Status({ state: 'v3' }, true), null, 'a V3 agent: nothing to say');
  assert.equal(v2.v3Status({ state: 'v3', universal: true, kiro: 'universal' }, true).title, 'Upgraded by Kiro');
  assert.equal(v2.v3Status({ state: 'v3', universal: true, kiro: 'out-of-sync' }, true).title, 'Out of sync');
  assert.match(v2.v3Status({ state: 'upgrade', universal: true, kiro: 'upgrade' }, true).text, /refreshes/);
  const blocked = v2.v3Status({ state: 'blocked' }, true);
  assert.equal(blocked.tone, 'info');
  assert.match(blocked.text, /upgrades it by itself/);
  const off = v2.v3Status({ state: 'blocked' }, false);
  assert.equal(off.tone, 'error');
  assert.match(off.text, /default agent instead/);
  assert.equal(v2.v3Status({ state: 'blocked', kiro: 'error' }, true).title, "Kiro can't read this agent");
  assert.equal(v2.editsGeneratedV3({ tools: ['read'], description: 'a' }, { tools: ['read'], description: 'b' }), false, 'a description edit keeps it in sync');
  assert.equal(v2.editsGeneratedV3({ permissions: { rules: [] } }, { permissions: { rules: [{ capability: 'shell', effect: 'allow' }] } }), true);
});

test('V3 tool names: unknown and retired ones are flagged, everything else passes', async () => {
  const { unknownTools, BUILTIN_TOOLS } = await import('./kiroTools.js');
  const ok = ['read', 'shell', '*', '@builtin', '@mcp', '@git', '@git/status', '@git/get*', 'subagent/reviewer', 'knowledge',
    'invoke_sub_agent', 'read_file', 'grep_search', 'remote_web_search', 'web_search', 'fs_write', 'mcp_git_*'];
  assert.deepEqual(unknownTools(ok), []);
  const bad = unknownTools(['use_aws', 'glob', 'frobnicate']);
  assert.deepEqual(bad.map((u) => u.name), ['use_aws', 'glob', 'frobnicate']);
  assert.match(bad[0].hint, /AWS MCP server/);
  assert.match(bad[1].hint, /file_search/);
  assert.match(bad[2].hint, /It's kept, in case it's new/);
  assert.deepEqual(unknownTools(['glob', 'use_subagent', 'frobnicate'], true).map((u) => u.name), ['frobnicate'], 'an upgraded agent keeps 2.x names on purpose');
  assert.ok(BUILTIN_TOOLS.every((b) => b.id && b.detail));
});

test('chats: tangents, rewinds and Kiro dashboard bookmarks and tags', async () => {
  const s = await import('./sessions.js');
  const chats = [
    { id: 'a', title: 'main', folder: '/w', updatedAt: '2', tags: ['ours'], kiroTags: ['release'], bookmarked: true },
    { id: 'b', title: 'ddb', folder: '/w', updatedAt: '3', kind: 'tangent', branchOf: 'a', tags: [] },
    { id: 'c', title: 'again', folder: '/w', updatedAt: '4', kind: 'rewind', branchOf: 'a', tags: [] },
    { id: 'd', title: 'sub', folder: '/w', updatedAt: '5', parentId: 'a', tags: [] },
  ];
  const c = s.chatCounts(chats);
  assert.equal(c.all, 3, 'tangents and rewinds are chats of their own; a subagent chat counts under its parent');
  assert.equal(c.bookmarked, 1);
  assert.equal(c.branches, 2);
  assert.deepEqual(s.filterChats(chats, { show: 'branches' }).map((x) => x.id), ['b', 'c']);
  assert.deepEqual(s.filterChats(chats, { show: 'bookmarked' }).map((x) => x.id), ['a']);
  assert.deepEqual(s.filterChats(chats, { query: '#release' }).map((x) => x.id), ['a'], "a Kiro tag matches #tag");
  assert.deepEqual(s.filterChats(chats, { tag: 'release' }).map((x) => x.id), ['a']);
});

test('workflow recipes: every template is valid, read and written in both formats', async () => {
  const w = await import('./workflows.js');
  const { RECIPE_TEMPLATES } = await import('./workflowTemplates.js');
  for (const t of RECIPE_TEMPLATES) {
    for (const format of ['json', 'yaml']) {
      const text = w.recipeFromTemplate(t.id, 'my-recipe', format);
      const { value, error } = w.readRecipe(text, format);
      assert.equal(error, '', `${t.id} ${format}`);
      assert.equal(value.name, 'my-recipe');
      const errors = w.checkRecipe(value).filter((p) => p.severity === 'error');
      if (t.id === 'blank') assert.deepEqual(errors.map((e) => e.message), ['A step needs a prompt.'], 'Blank asks for its prompt');
      else assert.deepEqual(errors, [], `${t.id} has no errors`);
    }
  }
  // YAML: an unchanged top-level key keeps its comment and layout.
  const yaml = '# team recipe\nname: r\ndescription: keep me # why\nsteps:\n  - type: step\n    id: a\n    agent: wf-planner\n    prompt: x\n';
  const { value } = w.readRecipe(yaml, 'yaml');
  const out = w.writeRecipe(yaml, 'yaml', w.setAt(value, ['steps', 0, 'prompt'], 'y'));
  assert.ok(out.startsWith('# team recipe\nname: r\ndescription: keep me # why\n'), out);
  assert.equal(w.readRecipe(out, 'yaml').value.steps[0].prompt, 'y');
  assert.match(w.readRecipe('{ nope', 'json').error, /Not valid JSON/);
  assert.match(w.readRecipe('a: [', 'yaml').error, /Not valid YAML/);
});

test('workflow recipes: the documented rules', async () => {
  const w = await import('./workflows.js');
  const msgs = (r, agents) => w.checkRecipe(r, { agents }).map((p) => `${p.severity}: ${p.message}`);
  const bad = msgs({ steps: [
    { type: 'step', id: 'a', agent: 'x' },
    { type: 'repeat', id: 'a', steps: [{ type: 'mystery', id: 'm' }], stopWhen: 'nope', stopCondition: { fileCheck: { path: 'r.json', jsonPath: 'items[0]', value: 1 } } },
    { type: 'parallel', id: 'p', branches: [{ type: 'step', id: 'b1', agent: 'wf-coder', prompt: 'x', completion: { completionSignal: 'success' } }] },
    { type: 'watch', id: 'w', handler: 'command', config: { command: 'run {{x}}', args: ['-v'], pollIntervalSec: 5, idleTimeoutSec: 9 } },
  ] });
  for (const re of [/needs a name/, /a is used twice/, /needs a prompt/, /No agent called x/, /positive whole maxIterations/, /onMaxIterations: pause, continue or abort/,
    /stopCondition or stopWhen, not both/, /jsonPath "items\[0\]"/, /stopWhen is/, /Unknown type "mystery"/, /joinPolicy/, /completion \(interactive\) can't be inside a parallel/,
    /no args/, /Templates aren't allowed in config.command/, /every 10 seconds/, /idleTimeoutSec goes on the watch itself/]) {
    assert.ok(bad.some((m) => re.test(m)), `expected ${re}: ${bad.join(' | ')}`);
  }
  assert.ok(msgs({ name: 'r', steps: [{ type: 'step', id: 'a', agent: 'mine', prompt: 'x' }] }, ['mine']).length === 0, 'your own agent is fine');
  // Templates: order, parallel isolation, inputs.
  const r = { name: 'r', inputs: { task: 'prompt' }, steps: [
    { type: 'step', id: 'first', agent: 'wf-planner', prompt: '{{previous.output}} {{task}} {{later.output}} {{ghost}} {{artifacts.plan}}' },
    { type: 'parallel', id: 'p', joinPolicy: 'all', branches: [
      { type: 'step', id: 'x', agent: 'wf-coder', prompt: '{{previous.output}} {{first.output}}', artifacts: { plan: 'plan.md' } },
      { type: 'step', id: 'y', agent: 'wf-coder', prompt: '{{x.output}}' },
    ] },
    { type: 'step', id: 'later', agent: 'wf-coder', prompt: '{{previous.output}} {{x.output}} {{artifacts.plan}} {{steps.first.output}}' },
  ] };
  const at = (id) => w.checkRecipe(r).filter((p) => w.getAt(r, p.path)?.id === id).map((p) => p.message);
  assert.equal(at('first').length, 4, at('first').join(' | '));
  assert.ok(at('first').some((m) => /later, which doesn't run before this/.test(m)));
  assert.ok(at('first').some((m) => /ghost.*literal text/.test(m)));
  assert.ok(at('x').some((m) => /previous.output.*has nothing before it/.test(m)) && at('x').length === 1, at('x').join(' | '));
  assert.ok(at('y').some((m) => /x, which doesn't run before this/.test(m)), 'parallel branches see nothing of each other');
  assert.deepEqual(at('later'), [], 'after the parallel, everything inside it is available');
  assert.deepEqual(w.insertOptions(r, ['steps', 2]).map((o) => o.token),
    ['{{task}}', '{{previous.output}}', '{{first.output}}', '{{x.output}}', '{{y.output}}', '{{artifacts.plan}}']);
  assert.deepEqual(w.insertOptions(r, ['steps', 1, 'branches', 1]).map((o) => o.token), ['{{task}}', '{{first.output}}']);
  // A repeat's stop condition may read its own body.
  const loop = { name: 'l', steps: [{ type: 'repeat', id: 'loop', maxIterations: 3, onMaxIterations: 'pause', stopWhen: '{{agg.output}} contains APPROVED',
    steps: [{ type: 'step', id: 'agg', agent: 'wf-review-aggregator', prompt: 'x' }] }] };
  assert.deepEqual(w.checkRecipe(loop), []);
});

test('workflow recipes: tree edits keep ids unique', async () => {
  const w = await import('./workflows.js');
  let r = { name: 'r', steps: [{ type: 'step', id: 'step-1', agent: 'wf-planner', prompt: 'a' }] };
  r = w.addNode(r, ['steps'], w.newNode(r, 'step'));
  assert.equal(r.steps[1].id, 'step-2');
  r = w.addNode(r, ['steps'], w.newNode(r, 'parallel'));
  r = w.addNode(r, ['steps', 2, 'branches'], w.newNode(r, 'step'));
  assert.equal(r.steps[2].branches[0].id, 'step-3');
  assert.deepEqual(w.walkNodes(r).map((n) => [n.node.id, n.depth]), [['step-1', 0], ['step-2', 0], ['parallel-1', 0], ['step-3', 1]]);
  r = w.moveNode(r, ['steps', 1], -1);
  assert.deepEqual(r.steps.map((n) => n.id), ['step-2', 'step-1', 'parallel-1']);
  assert.equal(w.moveNode(r, ['steps', 0], -1), r, 'the first node cannot move up');
  r = w.removeNode(r, ['steps', 2, 'branches', 0]);
  assert.deepEqual(r.steps[2].branches, []);
  assert.equal(w.runCommand(r), '/workflow run r');
  assert.match(w.validatePrompt('.kiro/workflows/r.workflow.json'), /^Run validate_workflow on \.kiro\/workflows\/r\.workflow\.json\./);
});

test('memory filter by type and location', async () => {
  const { filterMemories } = await import('./memory.js');
  const list = [{ title: 'a', summary: '', type: 'USER_PREFERENCE', scopes: ['Global'] }, { title: 'b', summary: '', type: 'SEMANTIC', scopes: ['repo:github/x/y'] }];
  assert.deepEqual(filterMemories(list, '', 'SEMANTIC').map((m) => m.title), ['b']);
  assert.deepEqual(filterMemories(list, '', 'global').map((m) => m.title), ['a']);
  assert.deepEqual(filterMemories(list, '', 'repo').map((m) => m.title), ['b']);
  assert.deepEqual(filterMemories(list, 'a', '').map((m) => m.title), ['a']);
});

test('spec task progress', async () => {
  const { taskProgress } = await import('./specs.js');
  assert.deepEqual(taskProgress('# Tasks\n- [x] 1. Model\n  - [x] 1.1 Table\n  - [ ] 1.2 Index\n- [ ] 2. API\n- [ ] not a task\n'), { done: 2, total: 4 });
  assert.deepEqual(taskProgress(''), { done: 0, total: 0 });
});

test('permission rule helpers for an agent', async () => {
  const r = await import('./permRows.js');
  const spec = { tools: ['read', 'shell', 'subagent/x'], resources: ['skill://a'], includePowers: true };
  const caps = r.agentCapabilities(spec, { hasServers: true });
  assert.deepEqual([...caps], ['fs_read', 'shell', 'mcp', 'subagent', 'skill', 'power']);
  assert.deepEqual([...r.agentCapabilities({ tools: [] })], []);
  assert.equal(r.CAPABILITIES.find((c) => c.cap === 'shell').label, 'run commands');
  assert.deepEqual(r.EFFECT_LABELS.map((e) => e.effect), ['allow', 'ask', 'deny', 'evaluate']);
  const s = r.suggestionsFor('mcp', { servers: { git: ['status'] } });
  assert.deepEqual(s.options, ['git/*', 'git/status']);
  assert.equal(s.describe('git/status'), 'one tool of git');
  assert.ok(r.suggestionsFor('shell').options.includes('rm -rf *'));
  assert.deepEqual(r.suggestionsFor('subagent', { agents: ['reviewer'] }).options, ['reviewer']);
});

test('permissions.yaml: form and text stay in sync, comments and other keys survive', async () => {
  const { readPermissions, writePermissions } = await import('./permYaml.js');
  const text = '# team policy\nworkspaceTrusted: true\npolicies:\n  - read-only\nrules:\n  - capability: shell\n    match: ["git *"]\n    effect: allow # fine\n';
  const form = readPermissions(text);
  assert.equal(form.error, '');
  assert.deepEqual(form.policies, ['read-only']);
  assert.deepEqual(form.rules, [{ capability: 'shell', match: ['git *'], exclude: [], effect: 'allow' }]);

  const out = writePermissions(text, { policies: [], rules: [...form.rules, { capability: 'fs_write', match: [], exclude: ['*.lock'], effect: 'deny' }] });
  assert.ok(out.startsWith('# team policy\nworkspaceTrusted: true\n'), out);
  assert.ok(!out.includes('policies'), 'no presets removes the key');
  assert.ok(!out.includes('match: []'), 'empty lists are left out');
  assert.ok(out.includes('exclude:\n      - "*.lock"') || out.includes("exclude:\n      - '*.lock'"), out);
  assert.deepEqual(readPermissions(out).rules.map((r) => r.capability), ['shell', 'fs_write']);

  assert.equal(readPermissions('').error, '');
  assert.ok(writePermissions('', { policies: ['allow-all'], rules: [] }).startsWith('policies:\n  - allow-all\nrules: []'));
  assert.match(readPermissions('rules:\n  - capability: shell\n    effect: maybe\n').error, /effect must be one of allow, ask, deny, evaluate/);
  assert.match(readPermissions('rules: [').error, /./);
  assert.equal(writePermissions('rules: [', { policies: [], rules: [] }), 'rules: [', 'broken text is left alone');
});

test('JSON cursor → top-level key; keys → cards; keys no card edits', async () => {
  const { keyPathAt } = await import('./jsonRange.js');
  const topLevelKeyAt = (t, pos) => keyPathAt(t, pos)[0] || '';
  const text = '{\n  "name": "a",\n  "tools": ["read", {"x": "y"}],\n  "permissions": { "rules": [ { "capability": "shell" } ] }\n}\n';
  assert.equal(topLevelKeyAt(text, text.indexOf('"name"') + 3), 'name');
  assert.equal(topLevelKeyAt(text, text.indexOf('"x"')), 'tools', 'inside a nested object still the top-level key');
  assert.equal(topLevelKeyAt(text, text.indexOf('"capability"')), 'permissions');
  assert.equal(topLevelKeyAt(text, text.indexOf(',\n  "tools"')), 'name', 'the value end still belongs to the key');
  assert.equal(topLevelKeyAt(text, text.indexOf('"tools"') - 1), '', 'between members: nothing');
  assert.equal(topLevelKeyAt(text, text.length - 1), '', 'after the closing brace: nothing');
  assert.equal(topLevelKeyAt('[1, 2]', 1), '', 'not an object');
  assert.deepEqual(keyPathAt(text, text.indexOf('"x"'), 2), ['tools', 1], 'inside an array: the element index');
  const { findTopLevelKey } = await import('./jsonRange.js');
  assert.equal(text.slice(...Object.values(findTopLevelKey(text, ['tools', 1]))), '{"x": "y"}', 'an index path finds the element');
  assert.equal(findTopLevelKey(text, ['tools', 2]), null);
  assert.deepEqual(keyPathAt('{"mcpServers": {"fake": {"command": "x"}}}', 22, 2), ['mcpServers', 'fake']);
  const nested = '{"mcpServers": {"fake": {"command": "x"}}}';
  assert.deepEqual(keyPathAt(nested, nested.indexOf('"x"'), 3), ['mcpServers', 'fake', 'command']);

  const { sectionForKey, uneditedKeys } = await import('./agentKeys.js');
  const present = ['identity', 'tools', 'permissions', 'subagents', 'resources', 'knowledge', 'hooks'];
  assert.equal(sectionForKey('excludedTools', present), 'tools');
  assert.equal(sectionForKey('tools', present), 'tools', 'Tools owns tools, not Sub-agents');
  assert.equal(sectionForKey('allowedTools', present), '', 'no V3 card without the Kiro CLI V3 section');
  assert.equal(sectionForKey('allowedTools', [...present, 'v2']), 'v2');
  const other = uneditedKeys({ name: 'a', tools: [], allowedTools: ['fs_read'], kiroUpgrade: {}, weird: 1 }, present);
  assert.deepEqual(other.map((o) => o.key), ['allowedTools', 'kiroUpgrade', 'weird']);
  assert.match(other[0].note, /Permissions card/);
  assert.match(other[2].note, /Edit it in the JSON/);
});

test('skills: SKILL.md front matter read, written, checked', async () => {
  const { parseSkill, setSkillField, skillProblems, descriptionAdvice } = await import('./skills.js');
  const text = '---\nname: pr-review\ndescription: Review PRs. Use when reviewing.\nmetadata:\n  author: me\n---\n# Review\nSteps.\n';
  const { fields, body, hasFront, error } = parseSkill(text);
  assert.equal(error, '');
  assert.ok(hasFront);
  assert.deepEqual(fields, { name: 'pr-review', description: 'Review PRs. Use when reviewing.', license: '', compatibility: '', metadata: { author: 'me' } });
  assert.equal(body, '# Review\nSteps.\n');

  let out = setSkillField(text, 'license', 'MIT');
  assert.ok(out.startsWith('---\nname: pr-review\ndescription: Review PRs. Use when reviewing.\nlicense: MIT\nmetadata:\n  author: me\n---\n# Review'), out);
  out = setSkillField(out, 'metadata', {});
  assert.ok(!out.includes('metadata'), 'an empty value removes the key');
  out = setSkillField('# No front matter\n', 'name', 'x');
  assert.equal(out, '---\nname: x\n---\n# No front matter\n', 'front matter is added when missing');
  assert.equal(setSkillField('---\nname: [\n---\nbody', 'name', 'x'), '---\nname: [\n---\nbody', 'broken YAML is left alone');
  assert.match(parseSkill('---\nname: [\n---\nbody').error, /not valid YAML/);

  assert.deepEqual(skillProblems(fields, 'pr-review'), []);
  assert.match(skillProblems(fields, 'other')[0], /must match the folder name, other/);
  assert.match(skillProblems({ ...fields, name: '', description: '' }, 'x').join(' '), /Name is required.*Description is required/);
  assert.match(skillProblems({ ...fields, name: 'Bad_Name' }, 'Bad_Name')[0], /lowercase/);
  assert.match(descriptionAdvice('Helps with code review'), /Short descriptions/);
  assert.match(descriptionAdvice('Reviews pull requests for security vulnerabilities and coverage gaps'), /Add when to use it/);
  assert.equal(descriptionAdvice('Review pull requests for security vulnerabilities and test coverage. Use when reviewing PRs.'), '');
});

test('prompts: command, placeholders, usage line, insert options', async () => {
  const { promptPlaceholders, promptUsage, placeholderOptions } = await import('./prompts.js');
  assert.deepEqual(promptPlaceholders('Review $ARGUMENTS and $2 then $1 ($10 is not one)'), { all: true, positions: [1, 2] });
  assert.equal(promptUsage('review.md', { all: false, positions: [] }), '/review');
  assert.equal(promptUsage('review.md', { all: true, positions: [] }), '/review <anything you type>');
  assert.equal(promptUsage('review.md', { all: false, positions: [1, 3] }), '/review <argument 1> <argument 2> <argument 3>');
  assert.equal(promptUsage('review.md', { all: true, positions: [1] }), '/review <argument 1> …');
  assert.deepEqual(placeholderOptions({ all: false, positions: [] }).map((o) => o.token), ['$ARGUMENTS', '$1']);
  assert.deepEqual(placeholderOptions({ all: true, positions: [1, 2] }).map((o) => o.token), ['$ARGUMENTS', '$1', '$2', '$3']);
});

test('acp: the command and the samples use the full kiro-cli path; WSL goes through wsl.exe', async () => {
  const { acpOptions } = await import('./acp.js');
  const server = (env) => JSON.parse(acpOptions(env)[0].sample).agent_servers['Kiro Agent'];
  assert.deepEqual(server({ path: '/home/me/.local/bin/kiro-cli', platform: 'linux' }), { command: '/home/me/.local/bin/kiro-cli', args: ['acp'] });
  assert.deepEqual(server({ path: '/home/me/.local/bin/kiro-cli', isWSL: true }), { command: 'wsl.exe', args: ['-e', '/home/me/.local/bin/kiro-cli', 'acp'] });
  assert.equal(acpOptions({ isWSL: true })[0].where, '%USERPROFILE%\\.jetbrains\\acp.json', 'WSL: the editor is on Windows');
  assert.equal(acpOptions({ path: '/k/kiro-cli', isWSL: true })[3].start, '/k/kiro-cli acp', 'your own program runs where Kiro does: no wsl.exe');
  const opts = acpOptions({ path: 'C:\\Kiro\\kiro-cli.exe', platform: 'windows' });
  assert.deepEqual(opts.map((o) => o.id), ['jetbrains', 'zed', 'plugin', 'program']);
  assert.deepEqual(JSON.parse(opts[0].sample), { agent_servers: { 'Kiro Agent': { command: 'C:\\Kiro\\kiro-cli.exe', args: ['acp'] } } });
  assert.equal(opts[1].where, '%APPDATA%\\Zed\\settings.json');
  assert.equal(JSON.parse(opts[1].sample).agent_servers['Kiro Agent'].type, 'custom');
  assert.deepEqual(opts[2].fields.map((f) => [f.label, f.value]), [['Command', 'C:\\Kiro\\kiro-cli.exe'], ['Arguments', 'acp']]);
  assert.equal(opts[3].start, 'C:\\Kiro\\kiro-cli.exe acp');
  assert.deepEqual(opts[3].messages.map((m) => JSON.parse(m.sample).method), ['initialize', 'session/new', 'session/prompt']);
  assert.ok(opts[3].messages[0].sample.includes('\n  '), 'messages are shown spread out');
  assert.equal(acpOptions({ platform: 'linux' })[0].where, '~/.jetbrains/acp.json');
});

test('workflow graph helpers: insert, reads-from, artifacts, run status', async () => {
  const w = await import('./workflows.js');
  let r = { name: 'r', steps: [
    { type: 'step', id: 'a', agent: 'wf-planner', prompt: 'x', artifacts: { plan: 'plan.md' } },
    { type: 'step', id: 'c', agent: 'wf-coder', prompt: '{{previous.output}} {{artifacts.plan}} {{a.output}}' },
  ] };
  r = w.insertNode(r, ['steps'], 1, w.newNode(r, 'step'));
  assert.deepEqual(r.steps.map((n) => n.id), ['a', 'step-1', 'c']);
  assert.deepEqual(w.readsFrom(r, ['steps', 2]), { ids: ['step-1', 'a'], artifacts: ['plan'] });
  assert.deepEqual(w.artifactOwners(r), { plan: 'a' });
  assert.ok(w.BUNDLED_AGENTS.some((a) => a.id === 'wf-code-reviewer'), 'Kiro ships wf-code-reviewer');
  const loop = { type: 'repeat', id: 'loop', stopWhen: 'wait.terminal', steps: [] };
  assert.deepEqual(w.readsFrom({ steps: [loop] }, ['steps', 0]).ids, ['wait']);
  const status = w.runStatusById({ nodeId: 'wf_1', type: 'sequence', status: 'running', children: [
    { nodeId: 'a', type: 'step', status: 'completed' },
    { nodeId: 'loop', type: 'repeat', status: 'running', children: [
      { nodeId: 'fix', type: 'step', status: 'failed', iteration: 0 },
      { nodeId: 'fix', type: 'step', status: 'running', iteration: 1 }] }] });
  assert.equal(status.a.status, 'completed');
  assert.equal(status.fix.status, 'running', 'the latest iteration wins');
  assert.equal(status.fix.runs, 2);
  assert.equal(w.RUN_STATUS.aborted.label, 'stopped');
});

test('powers: plugin.json rules and a new power', async () => {
  const p = await import('./powers.js');
  const files = p.newPowerFiles('team-api', 'Me');
  const m = JSON.parse(files['plugin.json']);
  assert.equal(m.name, 'team-api');
  assert.deepEqual(p.manifestProblems(m).map((x) => x.field), ['description', 'keywords'], 'a new power asks for its description and keywords');
  assert.deepEqual(p.manifestProblems({ ...m, description: 'x', keywords: ['orders'] }), []);
  assert.deepEqual(p.manifestProblems({ name: 'Bad_Name', version: '1', author: {} }).map((x) => x.field), ['$schema', 'name', 'version', 'description', 'author', 'keywords']);
  assert.ok(JSON.parse(files['mcp.json']).mcpServers);
  assert.ok(files['skills/getting-started/SKILL.md'].startsWith('---\nname: getting-started\n'));
  assert.match(p.keywordAdvice(['api']), /a few more/);
  assert.match(p.keywordAdvice(['db', 'orders', 'billing']), /Very short/);
  assert.equal(p.keywordAdvice(['orders', 'billing', 'invoices']), '');
  // POWER.md (the original format): front matter read and written, instructions kept.
  const md = '---\nname: "postman"\ndescription: "API testing"\nkeywords: ["postman", "api"]\nauthor: "Postman"\n---\n\n# Onboarding\nSteps.\n';
  const r = p.readManifest(md, 'POWER.md');
  assert.equal(r.error, '');
  assert.deepEqual(r.value.keywords, ['postman', 'api']);
  assert.deepEqual(p.manifestProblems(r.value, 'POWER.md'), [], 'POWER.md needs no version, schema or author object');
  const out = p.writeManifest(md, 'POWER.md', { ...r.value, keywords: ['postman', 'api', 'rest'] });
  assert.ok(out.endsWith('\n# Onboarding\nSteps.\n') && p.readManifest(out, 'POWER.md').value.keywords.length === 3, out);
  assert.ok(out.includes('name: "postman"'), 'untouched keys keep their quoting');
  assert.ok(out.includes('keywords: [ "postman", "api", "rest" ]'), `a flow list stays a flow list: ${out}`);
  assert.match(p.readManifest('# no front matter', 'POWER.md').error, /needs front matter/);
  assert.equal(p.authorName({ author: { name: 'A' } }), 'A');
  assert.equal(p.authorName({ author: 'B' }), 'B');
  assert.deepEqual(p.withAuthor({ author: { name: 'A', url: 'u' } }, 'plugin.json', 'C'), { name: 'C', url: 'u' });
  assert.equal(p.withAuthor({}, 'POWER.md', 'D'), 'D');
  assert.match(p.newPowerSkill('setup'), /^---\nname: setup\n/);
  // Where Kiro reads each file; everything else stays listed, with why.
  const asFiles = (l) => l.map((rel) => ({ rel }));
  const lay = p.powerLayout({ manifest: { format: 'plugin.json' }, instructions: 'dev.kiro/INSTRUCTIONS.md', skills: ['pr'], steering: ['dev.kiro/steering/a.md'],
    files: asFiles(['plugin.json', 'mcp.json', 'POWER.md', 'README.md', 'dev.kiro/steering/a.md', 'dev.kiro/steering/sub/b.md', 'steering/c.md', 'skills/pr/SKILL.md', 'skills/pr/scripts/check.sh', 'skills/loose/x.txt']) });
  assert.deepEqual(lay.skillFiles, { pr: ['skills/pr/scripts/check.sh'] });
  const why = Object.fromEntries(lay.other.map((o) => [o.rel, o.why]));
  assert.deepEqual(Object.keys(why), ['POWER.md', 'README.md', 'dev.kiro/steering/sub/b.md', 'steering/c.md', 'skills/loose/x.txt']);
  assert.match(why['POWER.md'], /ignores POWER.md/);
  assert.match(why['steering/c.md'], /goes in dev.kiro\/steering/);
  assert.match(why['dev.kiro/steering/sub/b.md'], /directly in dev.kiro\/steering/);
  assert.match(why['skills/loose/x.txt'], /needs a SKILL.md/);
  const old = p.powerLayout({ manifest: { format: 'POWER.md' }, instructions: 'POWER.md', skills: [], steering: ['steering/s.md'], files: asFiles(['POWER.md', 'steering/s.md', 'skills/x/SKILL.md']) });
  assert.match(old.other[0].why, /ignores skills in POWER.md powers/);
});

test('sandbox: the permission rules it follows, edited in place', async () => {
  const sb = await import('./sandbox.js');
  const rules = [
    { capability: 'shell', effect: 'ask' },
    { capability: 'sandbox_network', match: ['evil.example.com'], effect: 'deny' },
    { capability: 'fs_write', match: ['src/**'], effect: 'allow' },
    { capability: 'mcp', effect: 'allow' },
    { capability: 'sandbox_network', match: ['*.github.com'], effect: 'allow' },
  ];
  const mine = sb.sandboxRules(rules);
  assert.deepEqual(mine.map((r) => r.capability), ['sandbox_network', 'fs_write', 'sandbox_network']);
  // Edit one, remove one, add one: other rules stay where they were, order among these is kept.
  const next = [{ ...mine[0], effect: 'allow' }, mine[2], { capability: 'sandbox_network', match: ['api.example.com'], effect: 'allow' }];
  const merged = sb.mergeSandboxRules(rules, next);
  assert.deepEqual(merged.map((r) => `${r.capability}:${r.effect}`), ['shell:ask', 'sandbox_network:allow', 'sandbox_network:allow', 'mcp:allow', 'sandbox_network:allow']);
  assert.deepEqual(merged[2].match, ['*.github.com']);
  assert.deepEqual(merged[4].match, ['api.example.com']);
  assert.deepEqual(sb.mergeSandboxRules(rules, mine), rules, 'no edits, no change');
});

test('memory: a new memory as Kiro accepts it, and when changes are blocked', async () => {
  const m = await import('./memory.js');
  const { versionAtLeast } = await import('./version.js');
  assert.equal(m.titleSlug('  Seed the DB before tests! '), 'seed-the-db-before-tests');
  assert.equal(m.titleSlug('x'.repeat(80)).length, 50);
  const good = { type: 'SEMANTIC', scope: 'repo:github/acme/shop', title: 'seed-db', summary: 'Seed first.', content: 'make seed' };
  assert.deepEqual(m.draftProblems(good), {});
  assert.deepEqual(Object.keys(m.draftProblems({ type: 'X', title: 'a b', summary: 'a\nb', content: ' ' })).sort(), ['content', 'scope', 'summary', 'title', 'type']);
  assert.deepEqual(m.draftProblems({ ...good, scope: '' }, { create: false }), {}, 'an edit keeps its scope');
  assert.match(m.draftProblems({ ...good, summary: 's'.repeat(201) }).summary, /200/);
  const ok = { installed: true, signedIn: true, version: '3.1.0' };
  assert.equal(m.memoryEditBlocker(ok, 'read_write', versionAtLeast), '');
  assert.equal(m.memoryEditBlocker(ok, '', versionAtLeast), '', 'not set: Kiro decides, and says so if it refuses');
  assert.match(m.memoryEditBlocker({ ...ok, version: '2.34.2' }, '', versionAtLeast), /2\.36/);
  assert.match(m.memoryEditBlocker({ ...ok, signedIn: false }, '', versionAtLeast), /Sign in/);
  assert.match(m.memoryEditBlocker(ok, 'read_only', versionAtLeast), /Read only/);
  assert.match(m.memoryEditBlocker(ok, 'disabled', versionAtLeast), /Off/);
});

test('specs: kinds, config, templates and tasks', async () => {
  const sp = await import('./specs.js');
  const kind = (id) => sp.SPEC_KINDS.find((k) => k.id === id);
  assert.equal(sp.specKindOf({ specType: 'feature', workflowType: 'design-first' }, []).id, 'design-first');
  assert.equal(sp.specKindOf({ specType: 'quick-spec', workflowType: 'fast-task' }, []).id, 'quick-spec');
  assert.equal(sp.specKindOf({}, ['bugfix.md']).id, 'bugfix');
  assert.equal(sp.specKindOf({}, ['requirements.md']), undefined);
  const cfg = JSON.parse(sp.writeSpecConfig('{"specId":"abc","extra":1}', kind('bugfix')));
  assert.deepEqual(cfg, { specId: 'abc', extra: 1, workflowType: 'requirements-first', specType: 'bugfix' });
  assert.equal(JSON.parse(sp.writeSpecConfig('', kind('quick-spec'), () => 'new-id')).specId, 'new-id');
  const files = sp.newSpecFiles('login', kind('bugfix'));
  assert.deepEqual(Object.keys(files).sort(), ['.config.kiro', 'bugfix.md'], 'only the first document: Kiro writes the rest');
  assert.match(files['bugfix.md'], /Unchanged Behavior/);
  assert.equal(sp.specSlug(' Login Page! '), 'login-page');
  const tasks = '# Plan\n- [x] 1. Model\n  - [ ] 1.1 Table\n  - [ ]* 1.2 Tests\n- [-] 2. API\n- not a task\n';
  const t = sp.parseTasks(tasks);
  assert.deepEqual(t.map((x) => [x.num, x.depth, x.done, x.optional]), [['1', 0, true, false], ['1.1', 1, false, false], ['1.2', 1, false, true], ['2', 0, false, false]]);
  assert.equal(t[0].title, 'Model');
  const ticked = sp.setTaskDone(tasks, t[1].line, true);
  assert.ok(ticked.includes('  - [x] 1.1 Table') && ticked.endsWith('- not a task\n'));
  assert.deepEqual(sp.taskProgress(ticked), { done: 2, total: 4 });
  assert.equal(sp.specCommands('login', false).length, 3);
  assert.match(sp.specCommands('login', true)[3].cmd, /analyze_requirements login/);
  assert.deepEqual(sp.specAction('after', 'login', { doc: 'requirements.md', later: ['design.md', 'tasks.md'] }).lines,
    ['/spec login', 'I edited requirements.md. Update design.md and tasks.md to match it, and keep the tasks that are already done ticked.']);
  assert.match(sp.specAction('task', 'login', { task: '2.1' }).lines[1], /task 2\.1 only/);
  assert.deepEqual(sp.specAction('run', 'login').lines, ['/spec run login']);
});

test('lsp: Kiro defaults and checks', async () => {
  const l = await import('./lsp.js');
  const doc = l.lspFileFor(['go', 'python', 'nope']);
  assert.deepEqual(Object.keys(doc.languages), ['go', 'python']);
  assert.equal(doc.languages.python.command, 'pyright-langserver');
  assert.deepEqual(l.lspProblems(doc.languages.go), []);
  assert.equal(l.lspProblems({ args: '--stdio', request_timeout_secs: 0, initialization_options: [] }).length, 3);
  assert.deepEqual(l.lspLanguages({}), {});
  const cpp = l.LSP_DEFAULTS.cpp.install;
  assert.match(l.installFor(cpp, { platform: 'windows' }), /winget install LLVM\.LLVM/);
  assert.equal(l.installFor(cpp, { platform: 'linux', isWSL: true }), 'sudo apt install clangd', 'WSL uses Linux commands');
  assert.equal(l.installFor(cpp, { platform: 'darwin' }), 'brew install llvm');
  assert.equal(l.installFor(l.LSP_DEFAULTS.go.install, { platform: 'windows' }), 'go install golang.org/x/tools/gopls@latest');
  assert.ok(!/brew/.test(l.installFor(l.LSP_DEFAULTS.java.install, { platform: 'windows' })), 'no brew on Windows');
});

