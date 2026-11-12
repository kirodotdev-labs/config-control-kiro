/**
 * @fileoverview One power on one page, in the layout of the agent editor:
 * cards on the left, a file on the right. Clicking a card (or one of its
 * rows, or a file of the power in the navigator) shows that file on the
 * right: the manifest (plugin.json, or POWER.md in the original format),
 * mcp.json, an instructions, steering or skill file, or any other file.
 * Cards and files stay in sync; one Save writes every file changed.
 *
 * Installed powers are edited in place: Kiro's copy, so new chats use the
 * changes, and Reinstall latest replaces them. Powers you build live in
 * power-sources and are installed with kiro-cli.
 *
 * Where guidance lives follows Kiro's PowersManager: a plugin.json power has
 * skills/<name>/SKILL.md, dev.kiro/steering/ and dev.kiro/INSTRUCTIONS.md; a
 * POWER.md power has steering/ and its instructions in POWER.md. A skill's
 * scripts, references and assets are under the skill; every other file stays
 * in Other files with why Kiro doesn't read it, so nothing is hidden.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Link, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { Add, Article, Bolt, Delete, Description, Download, Extension, FolderOpen, Hub, Person, Refresh, School, Science, Storage } from '@mui/icons-material';
import { usePowerActions, usePowers, usePowerSource, useInstalledPower } from '../../data/useKiro';
import { useDeleteFile, useFileText, useSaveFile } from '../../data/useFiles';
import { useRelations } from '../../data/useRelations';
import { errorMessage } from '../../data/errors';
import { useEditorGuard } from '../../contexts/UnsavedChangesContext';
import { isObject, parseJson, setField } from '../../domain/json.js';
import { authorName, keywordAdvice, manifestProblems, newPowerSkill, powerLayout, readManifest, withAuthor, writeManifest } from '../../domain/powers.js';
import { EditorFrame, EditStatus, SaveButton } from '../../ui/EditorFrame';
import { CodeEditor } from '../../ui/CodeEditor';
import { SplitPane } from '../../ui/SplitPane';
import { SectionCard } from '../../ui/SectionCard';
import { ListInput } from '../../ui/ListInput';
import { Loading, ErrorState, Hint } from '../../ui/States';
import { useConfirm } from '../../ui/ConfirmProvider';
import { useNotify } from '../../ui/NotifyProvider';
import { ServerList } from '../mcp/ServerList';
import { SkillForm } from '../skills/SkillForm';
import { AddSkillFileDialog } from '../skills/AddSkillFileDialog';
import { TerminalButton } from '../launcher/TerminalButton';
import { DeleteFileButton } from '../files/DeleteFileButton';
import { extensionOf, isBinaryName } from '../files/paths';

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LANGUAGE = { json: 'json', yaml: 'yaml', yml: 'yaml', md: 'markdown' };
const MCP = 'mcp.json';
const MCP_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';

/**
 * @param {Object} props
 * @param {{kind: 'power'|'powersource', name: string, path?: string}} props.node an installed power, or one you build.
 * @param {string} [props.file] the file to show, relative to the power (from the navigator).
 * @param {Object} [props.fileChoice] changes on each navigator click, so the same file can be shown again.
 * @param {() => void} props.onGone it was uninstalled or deleted.
 */
export function PowerEditor({ node, file, fileChoice, onGone }) {
  const own = node.kind === 'powersource';
  const installedQ = useInstalledPower(own ? '' : node.name);
  const sourceQ = usePowerSource(own ? node.path : '');
  const q = own ? sourceQ : installedQ;
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={q.refetch} />;
  return <PowerBody key={q.data.dir} own={own} power={q.data} file={file} fileChoice={fileChoice} onGone={onGone} refetch={q.refetch} />;
}

/** The skill a file belongs to (plugin.json powers), or ''. */
function skillOf(rel, power) {
  const m = /^skills\/([^/]+)\//.exec(rel);
  return m && power.manifest.format === 'plugin.json' && power.skills.includes(m[1]) ? m[1] : '';
}

/** Which card a file belongs to. */
function cardOf(rel, power) {
  if (rel === power.manifest.format) return 'identity';
  if (rel === MCP) return 'mcp';
  if (rel === power.instructions || power.steering.includes(rel) || skillOf(rel, power)) return 'guidance';
  return 'files';
}

function PowerBody({ own, power, file, fileChoice, onGone, refetch }) {
  const format = power.manifest.format || 'plugin.json';
  const plugin = format === 'plugin.json';
  const [active, setActive] = useState(file || format);
  const [reveal, setReveal] = useState({ card: '', n: 0 });
  useEffect(() => { // a file of this power chosen in the navigator
    if (!file) return;
    setActive(file);
    setReveal((r) => ({ card: cardOf(file, power), n: r.n + 1 }));
  }, [file, fileChoice]); // eslint-disable-line react-hooks/exhaustive-deps

  // The files on show: the manifest and mcp.json always (the cards read them), and the active one.
  const pathOf = (rel) => `${power.dir}/${rel}`;
  const manifestQ = useFileText(pathOf(format));
  const mcpQ = useFileText(pathOf(MCP), true, true);
  const activeBinary = isBinaryName(active);
  const activeOther = active !== format && active !== MCP;
  const activeQ = useFileText(pathOf(active), activeOther && !activeBinary, true);
  const loaded = (rel) => (rel === format ? manifestQ.data?.content : rel === MCP ? mcpQ.data?.content : rel === active ? activeQ.data?.content : undefined) ?? '';

  // Edits, per file, until saved: { rel: { text, base } }.
  const [drafts, setDrafts] = useState({});
  const textOf = (rel) => drafts[rel]?.text ?? loaded(rel);
  const setText = (rel, text) => setDrafts((d) => ({ ...d, [rel]: { text, base: d[rel]?.base ?? loaded(rel) } }));
  const changed = Object.entries(drafts).filter(([, d]) => d.text !== d.base).map(([rel]) => rel);
  const dirty = changed.length > 0;

  const save = useSaveFile();
  const remove = useDeleteFile();
  const notify = useNotify();
  const confirm = useConfirm();
  const { install, reinstall, uninstall } = usePowerActions();
  const catalog = usePowers().data;
  const installedNames = new Set((catalog?.installed || []).map((p) => p.name));
  const relations = useRelations({ id: 'powers', kind: 'powers' });
  const agents = (relations.data?.links || []).filter((l) => l.id.startsWith('agent:')).map((l) => l.id.slice(6));
  const [adding, setAdding] = useState(null); // 'skill' | 'steering'
  const [addFileTo, setAddFileTo] = useState(null); // {name, dir} of a skill

  // The manifest as a form.
  const manifestText = textOf(format);
  const { value, error } = readManifest(manifestText, format);
  const m = value || {};
  const set = (k, v) => setText(format, writeManifest(manifestText, format, setField(m, k, v)));
  const problems = value ? manifestProblems(m, format) : [];
  const fieldProblem = (f) => problems.find((p) => p.field === f)?.message;
  const keywords = Array.isArray(m.keywords) ? m.keywords : [];
  const listed = (catalog?.catalog || []).find((c) => c.name === (power.manifest.name || m.name)); // in Kiro's catalog
  const isInstalled = !own || installedNames.has(m.name);
  const folder = power.dir.split(/[\\/]/).pop();

  // mcp.json as the MCP cards.
  const mcpText = textOf(MCP);
  const mcpParsed = parseJson(mcpText || '{}');
  const mcpDoc = isObject(mcpParsed.value) ? mcpParsed.value : {};
  const servers = isObject(mcpDoc.mcpServers) ? mcpDoc.mcpServers : {};
  const setServers = (next) => {
    const base = mcpText ? mcpDoc : plugin ? { $schema: MCP_SCHEMA } : {};
    setText(MCP, `${JSON.stringify({ ...base, mcpServers: next }, null, 2)}\n`);
  };
  const busy = save.isPending || install.isPending || reinstall.isPending || uninstall.isPending;
  const jsonError = (rel) => (extensionOf(rel) === 'json' && textOf(rel) ? parseJson(textOf(rel)).error : '');
  const saveError = error || changed.map(jsonError).find(Boolean) || '';

  const onSave = useCallback(async () => {
    try {
      for (const rel of changed) await save.mutateAsync({ path: pathOf(rel), content: drafts[rel].text });
      setDrafts({});
      refetch();
      notify(!own ? 'Saved. New chats use the change.' : isInstalled ? 'Saved. Reinstall so Kiro uses the new version.' : 'Saved.', 'success');
    } catch (e) { notify(errorMessage(e), 'error'); }
  }, [changed, drafts, save, refetch, notify, own, isInstalled]); // eslint-disable-line react-hooks/exhaustive-deps
  useEditorGuard({ dirty, canSave: dirty && !saveError && !busy, onSave });

  const ok = (msg) => () => { refetch(); notify(msg, 'success'); };
  const fail = (e) => notify(errorMessage(e), 'error');
  const doInstall = async () => {
    if (isInstalled) {
      if (!await confirm({ title: `Reinstall ${m.name}?`, confirmLabel: 'Reinstall', danger: !own,
        body: own ? 'Kiro replaces its installed copy with this folder.' : 'Kiro removes it and installs the latest version from its catalog, so changes you made here are replaced. Kiro CLI has no update command, so this is how you get updates.' })) return;
      setDrafts({});
      reinstall.mutate({ name: m.name, target: own ? power.dir : m.name }, { onSuccess: ok('Reinstalled. New chats use it.'), onError: fail });
    } else {
      install.mutate(power.dir, { onSuccess: ok(`Installed. Kiro loads ${m.name} when a request mentions one of its keywords.`), onError: fail });
    }
  };
  const doUninstall = async () => {
    if (!await confirm({ title: `Uninstall ${m.displayName || m.name}?`, confirmLabel: 'Uninstall', danger: true,
      body: own ? 'Kiro removes its installed copy. Your folder stays, so you can install it again.' : 'Kiro removes the power, with any changes you made to it. Agents that include installed Powers stop getting it in new chats.' })) return;
    uninstall.mutate(m.name, { onSuccess: () => { notify('Uninstalled', 'success'); if (!own) onGone(); else refetch(); }, onError: fail });
  };
  const doAdd = async (name) => {
    const rel = adding === 'skill' ? `skills/${name}/SKILL.md` : `${power.steeringDir}/${name}.md`;
    const content = adding === 'skill' ? newPowerSkill(name) : `# ${name}\n\n`;
    try {
      await save.mutateAsync({ path: pathOf(rel), content, createOnly: true });
      // Show it once the power's file list has it, then close: closing puts focus back on the
      // card, which must already count the new file as its own (else it shows the card's first file).
      await refetch();
      setActive(rel);
      setAdding(null);
    } catch (e) { fail(e); }
  };
  const doDeleteFile = async (rel) => {
    if (!await confirm({ title: `Delete ${rel}?`, body: 'The file is deleted from disk. This can\'t be undone.', confirmLabel: 'Delete', danger: true })) return;
    remove.mutate(pathOf(rel), {
      onSuccess: () => { setDrafts(({ [rel]: _gone, ...rest }) => rest); setActive(format); refetch(); notify(`${rel} deleted`, 'success'); },
      onError: fail,
    });
  };

  // Guidance rows: the instructions, steering files, and (plugin.json) skills.
  const skillRel = (s) => `skills/${s}/SKILL.md`;
  const guidance = [
    { rel: power.instructions, label: plugin ? 'Instructions (dev.kiro/INSTRUCTIONS.md)' : 'Instructions (the body of POWER.md)', icon: <Article fontSize="small" />, fixed: true },
    ...power.steering.map((rel) => ({ rel, label: rel.split('/').pop(), icon: <Extension fontSize="small" />, kind: 'steering' })),
    ...(plugin ? power.skills.map((s) => ({ rel: skillRel(s), label: s, icon: <School fontSize="small" />, kind: 'skill' })) : []),
  ];
  const layout = powerLayout(power);
  const others = layout.other;
  const activeCard = cardOf(active, power);
  const show = (rel) => () => setActive(rel);
  const onCard = (card, rel) => () => { if (activeCard !== card) setActive(rel); };
  const readOnlyName = !own;

  const testHint = keywords.length
    ? <>Kiro loads this power when a request mentions one of its keywords. Try: <code>Using {keywords[0]}, …</code> or ask about {keywords.slice(0, 3).join(', ')}. In the chat, <code>/powers</code> lists what&apos;s installed.</>
    : <>Add keywords first: Kiro loads a power only when a request mentions one.</>;

  const changedChip = (rel) => drafts[rel] && drafts[rel].text !== drafts[rel].base && <Chip size="small" variant="outlined" label="changed" />;
  const fileRow = (rel, label, why) => (
    <Stack key={rel} direction="row" spacing={1} onClick={show(rel)} data-power-row={rel}
      sx={{ alignItems: 'center', pl: 1, pr: 0.5, py: 0.25, borderRadius: 1, cursor: 'pointer', bgcolor: active === rel ? 'action.selected' : 'transparent', '&:hover': { bgcolor: 'action.hover' } }}>
      <Description fontSize="small" sx={{ color: 'text.secondary' }} />
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontFamily: 'monospace' }} noWrap>{label}</Typography>
        {why && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{why}</Typography>}
      </Box>
      {changedChip(rel)}
      <Tooltip title={`Delete ${rel}`}>
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); doDeleteFile(rel); }}><Delete fontSize="small" /></IconButton>
      </Tooltip>
    </Stack>
  );
  const row = (g) => {
    const skill = g.kind === 'skill' ? g.label : '';
    const on = active === g.rel || (skill && skillOf(active, power) === skill);
    return (
      <Box key={g.rel} data-power-row={g.rel}>
        <Stack direction="row" spacing={1} onClick={show(g.rel)}
          sx={{ alignItems: 'center', px: 1, py: 0.5, borderRadius: 1, cursor: 'pointer', bgcolor: on ? 'action.selected' : 'transparent', '&:hover': { bgcolor: 'action.hover' } }}>
          <Box sx={{ color: 'primary.main', display: 'flex' }}>{g.icon}</Box>
          <Typography variant="body2" sx={{ flexGrow: 1, fontFamily: g.fixed ? undefined : 'monospace' }}>{g.label}</Typography>
          {changedChip(g.rel)}
          {!g.fixed && (
            <Tooltip title={`Delete ${g.rel}`}>
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); doDeleteFile(g.rel); }}><Delete fontSize="small" /></IconButton>
            </Tooltip>
          )}
        </Stack>
        {on && skill && (
          <Stack spacing={0.5} sx={{ mt: 0.5, ml: 3 }}>
            {active === g.rel && <SkillForm text={textOf(g.rel)} onChange={(t) => setText(g.rel, t)} folder={skill} />}
            {layout.skillFiles[skill].map((rel) => fileRow(rel, rel.slice(`skills/${skill}/`.length)))}
            <Box><Button size="small" startIcon={<Add />} onClick={() => setAddFileTo({ name: skill, dir: `${power.dir}/skills/${skill}` })}>Add a file</Button></Box>
          </Stack>
        )}
      </Box>
    );
  };

  const cards = [
    { id: 'identity', rel: format, title: 'What it is', icon: <Person />, summary: m.description || 'Name, description, author', open: true, body: (
      <Box component="fieldset" disabled={!!error} sx={{ border: 0, m: 0, p: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Stack direction="row" spacing={1.5}>
          <TextField size="small" label="Name" value={m.name || ''} onChange={(e) => set('name', e.target.value)} sx={{ flex: 1 }} disabled={readOnlyName}
            error={!!fieldProblem('name')} helperText={fieldProblem('name') || (readOnlyName ? 'Kiro knows the installed power by this name' : 'kebab-case; Kiro identifies the power by it')}
            slotProps={{ input: { sx: { fontFamily: 'monospace' } } }} />
          <TextField size="small" label="Version" value={m.version || ''} onChange={(e) => set('version', e.target.value || undefined)} sx={{ width: 150 }}
            error={!!fieldProblem('version')} helperText={fieldProblem('version') || 'e.g. 1.0.0'} />
        </Stack>
        {!plugin && <TextField size="small" label="Display name" value={m.displayName || ''} onChange={(e) => set('displayName', e.target.value || undefined)} />}
        <TextField size="small" label="Description" value={m.description || ''} onChange={(e) => set('description', e.target.value)} multiline maxRows={4}
          error={!!fieldProblem('description')} helperText={fieldProblem('description') || 'What it does, in one sentence'} />
        <Stack direction="row" spacing={1.5}>
          <TextField size="small" label="Author" value={authorName(m)} onChange={(e) => set('author', withAuthor(m, format, e.target.value))} sx={{ flex: 1 }}
            error={!!fieldProblem('author')} helperText={fieldProblem('author') || ' '} />
          {plugin && <TextField size="small" label="Repository" value={typeof m.repository === 'string' ? m.repository : ''} onChange={(e) => set('repository', e.target.value || undefined)} sx={{ flex: 1 }} helperText="Where people install it from" />}
        </Stack>
        {listed && (
          <Typography variant="caption" color="text.secondary">
            In Kiro&apos;s catalog: {[listed.tier, listed.category].filter(Boolean).join(' · ')}{listed.repository && <> · <Link href={listed.repository} target="_blank" rel="noreferrer">source</Link></>}
          </Typography>
        )}
      </Box>
    ) },
    { id: 'keywords', rel: format, card: 'identity', title: 'When Kiro loads it', icon: <Bolt />, summary: keywords.length ? keywords.join(', ') : 'No keywords: never loaded', open: true, badge: fieldProblem('keywords') ? 'needs keywords' : '', body: (
      <Box component="fieldset" disabled={!!error} sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}>
        <ListInput label="Keywords" value={keywords} onChange={(v) => set('keywords', v)} placeholder="Type a word and press Enter"
          helperText={fieldProblem('keywords') || keywordAdvice(keywords) || 'Kiro loads the power when a request mentions one of these. Until then it costs no context.'} />
      </Box>
    ) },
    { id: 'mcp', rel: MCP, title: 'MCP servers', icon: <Storage />, summary: `${Object.keys(servers).length} server${Object.keys(servers).length === 1 ? '' : 's'} (mcp.json)`, body: (
      <Stack spacing={1}>
        <Typography variant="caption" color="text.secondary">
          The tools the power brings. Kiro renames each server when it installs the power (api becomes power-{m.name || 'name'}-api). Put secrets in environment variables like ${'{API_KEY}'}.
        </Typography>
        {mcpParsed.error ? <Hint text="Fix the JSON on the right to see the servers as cards." /> : <ServerList servers={servers} onChange={setServers} />}
      </Stack>
    ) },
    { id: 'guidance', rel: power.instructions, title: plugin ? 'Instructions, steering and skills' : 'Instructions and steering', icon: <School />,
      summary: [`${power.steering.length} steering`, plugin && `${power.skills.length} skill${power.skills.length === 1 ? '' : 's'}`].filter(Boolean).join(' · '), body: (
      <Stack spacing={0.5}>
        <Typography variant="caption" color="text.secondary">
          What Kiro reads when the power activates. Steering files are in {power.steeringDir}/{plugin ? '; each skill is skills/<name>/SKILL.md' : '. Skills need the plugin.json format'}.
        </Typography>
        {guidance.map(row)}
        <Stack direction="row" spacing={1}>
          <Button size="small" startIcon={<Add />} onClick={() => setAdding('steering')}>Add steering</Button>
          {plugin && <Button size="small" startIcon={<Add />} onClick={() => setAdding('skill')}>Add a skill</Button>}
        </Stack>
      </Stack>
    ) },
    ...(others.length ? [{ id: 'files', rel: others[0].rel, title: 'Other files', icon: <FolderOpen />, summary: `${others.length} file${others.length === 1 ? '' : 's'} Kiro doesn't read on its own`, body: (
      <Stack spacing={0.5}>
        <Typography variant="caption" color="text.secondary">Files outside the places Kiro reads. They are kept, and you can still open, edit or delete them.</Typography>
        {others.map((o) => fileRow(o.rel, o.rel, o.why))}
      </Stack>
    ) }] : []),
    { id: 'used', title: 'Used by', icon: <Hub />, summary: isInstalled ? `the default agent${agents.length ? `, ${agents.join(', ')}` : ''}` : 'Not installed yet', body: (
      <Typography variant="body2">
        {isInstalled
          ? <>Kiro&apos;s default agent{agents.length ? <>, and {agents.join(', ')} (Include installed Powers on)</> : '. Turn on Include installed Powers in a custom agent\'s Powers card to give it this too.'}</>
          : 'Nobody yet: install it first.'}
      </Typography>
    ) },
    { id: 'build', title: own ? 'Build and test it' : 'Use and test it', icon: <Science />, summary: own ? (isInstalled ? 'installed · Reinstall after changes' : 'not installed yet') : 'Terminal to try it', open: true, body: (
      <Box component="ol" sx={{ m: 0, pl: 2.5, '& li': { mb: 0.5 } }}>
        {own ? (
          <>
            <Typography component="li" variant="body2"><strong>Describe it</strong> and give it <strong>keywords</strong>: the words people say when they need it.</Typography>
            <Typography component="li" variant="body2"><strong>Add what it brings</strong>: an MCP server for tools, steering or a skill for instructions.</Typography>
            <Typography component="li" variant="body2"><strong>Save</strong>, then <strong>{isInstalled ? 'Reinstall' : 'Install'}</strong>: Kiro keeps its own copy, so reinstall after each change.</Typography>
            <Typography component="li" variant="body2"><strong>Terminal</strong> opens a chat to test it: mention one of its keywords.</Typography>
            <Typography component="li" variant="body2"><strong>Share it</strong>: put this folder in a GitHub repository; others install it with the folder&apos;s URL.</Typography>
          </>
        ) : (
          <>
            <Typography component="li" variant="body2"><strong>Terminal</strong> opens a chat to try it: mention one of its keywords.</Typography>
            <Typography component="li" variant="body2"><strong>Change it</strong> here and Save: new chats use your changes.</Typography>
            <Typography component="li" variant="body2"><strong>Reinstall latest</strong> gets the catalog&apos;s newest version, replacing your changes.</Typography>
          </>
        )}
      </Box>
    ) },
  ];

  const left = (
    <Stack spacing={1.5} sx={{ p: 2 }}>
      {!own && (
        <Alert severity="info" variant="outlined">
          Kiro&apos;s installed copy: your changes apply to new chats. {listed ? 'Reinstall latest replaces them with the catalog version.' : 'Uninstalling deletes them.'}
        </Alert>
      )}
      {error && <Alert severity="error" variant="outlined">{format} has a problem, so its fields can&apos;t be edited until the text on the right is fixed: {error}</Alert>}
      {busy && !save.isPending && <Alert severity="info">Kiro is {uninstall.isPending ? 'removing' : 'installing'} the power. This can take a minute.</Alert>}
      {power.problems.filter((p) => !/mcp.json|required|kebab/.test(p)).map((p) => <Alert key={p} severity="warning" variant="outlined">{p}</Alert>)}
      {cards.map((c) => {
        const card = c.card || c.id;
        return (
          <Box key={c.id} data-section={`power-${c.id}`}>
            <SectionCard icon={c.icon} title={c.title} summary={c.summary} badge={c.badge} defaultOpen={c.open}
              active={!!c.rel && activeCard === card} onActivate={c.rel ? onCard(card, c.rel) : undefined}
              reveal={reveal.card === c.id ? reveal.n : 0}>{c.body}</SectionCard>
          </Box>
        );
      })}
    </Stack>
  );

  const activeExists = !activeOther || activeQ.data?.exists !== false || drafts[active];
  const right = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 1.5, py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="caption" sx={{ fontFamily: 'monospace', flexGrow: 1 }} data-testid="power-active-file">{active}</Typography>
        {!activeExists && <Typography variant="caption" color="text.secondary">new: created when you save</Typography>}
      </Stack>
      <Box sx={{ flexGrow: 1, minHeight: 0 }}>
        {activeBinary
          ? <Hint text={`This file type (.${extensionOf(active)}) can't be edited here. Kiro can still use it.`} />
          : activeOther && activeQ.isLoading ? <Loading />
            : <CodeEditor key={active} value={textOf(active)} onChange={(t) => setText(active, t)} language={LANGUAGE[extensionOf(active)] || 'text'} />}
      </Box>
    </Box>
  );

  return (
    <EditorFrame icon={<Bolt />} title={m.displayName || m.name || folder} path={power.dir}
      status={<>
        <EditStatus dirty={dirty} error={saveError} />
        <Chip size="small" variant="outlined" label={own ? 'yours' : 'installed by Kiro'} sx={{ ml: 0.5 }} />
        {own && isInstalled && <Chip size="small" color="success" variant="outlined" label="installed" sx={{ ml: 0.5 }} />}
        {problems.length > 0 && <Chip size="small" color="warning" variant="outlined" label={`${problems.length} to fix`} sx={{ ml: 0.5 }} />}
      </>}
      actions={<>
        {own && <DeleteFileButton target={{ path: power.dir, label: `the power ${m.name || folder}`, folder: true }} onDeleted={onGone} beforeDelete={() => setDrafts({})} />}
        {isInstalled && <Button color="inherit" startIcon={<Delete />} disabled={busy} onClick={doUninstall}>Uninstall</Button>}
        {(own || listed) && (
          <Button variant="outlined" startIcon={isInstalled ? <Refresh /> : <Download />} disabled={busy || (own && (dirty || problems.length > 0))} onClick={doInstall}
            title={own && dirty ? 'Save first' : own && problems.length ? 'Fix the manifest first' : ''}>{isInstalled ? (own ? 'Reinstall' : 'Reinstall latest') : 'Install'}</Button>
        )}
        <SaveButton dirty={dirty} valid={!saveError} saving={save.isPending} onClick={onSave} />
        <TerminalButton title={`Try ${m.displayName || m.name || 'this power'} in Kiro CLI V3`} hint={testHint}
          disabledReason={!isInstalled ? 'Install it first: Kiro only loads installed powers.' : dirty ? (own ? 'Save and reinstall first.' : 'Save first.') : ''} />
      </>}>
      {manifestQ.isLoading || mcpQ.isLoading ? <Loading /> : manifestQ.isError ? <ErrorState message={errorMessage(manifestQ.error)} onRetry={manifestQ.refetch} /> : (
        <SplitPane persistKey="power-editor" initial={55} left={left} right={right} />
      )}
      <AddSkillFileDialog skill={addFileTo} onClose={() => setAddFileTo(null)}
        onCreated={(n) => { setAddFileTo(null); refetch(); setActive(n.path.slice(power.dir.length + 1)); }} />
      <NameDialog open={adding !== null} title={adding === 'skill' ? 'Add a skill' : 'Add steering'} confirmLabel="Create"
        body={adding === 'skill' ? 'Creates skills/<name>/SKILL.md; its description says when Kiro should use it.' : `Creates ${power.steeringDir}/<name>.md, which Kiro reads when the power activates.`}
        onClose={() => setAdding(null)} onSubmit={doAdd} />
    </EditorFrame>
  );
}

/** Asks for a kebab-case name. */
function NameDialog({ open, title, body, confirmLabel, onClose, onSubmit }) {
  const [name, setName] = useState('');
  const [last, setLast] = useState(open);
  if (open !== last) { setLast(open); if (open) setName(''); }
  const n = name.trim();
  const bad = n && !KEBAB.test(n);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 1 }}>
        <Typography variant="body2" color="text.secondary">{body}</Typography>
        <TextField autoFocus size="small" label="Name" value={name} onChange={(e) => setName(e.target.value)} error={!!bad} helperText={bad ? 'kebab-case: lowercase letters, numbers and hyphens' : ' '}
          onKeyDown={(e) => { if (e.key === 'Enter' && n && !bad) onSubmit(n); }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!n || !!bad} onClick={() => onSubmit(n)}>{confirmLabel}</Button>
      </DialogActions>
    </Dialog>
  );
}
