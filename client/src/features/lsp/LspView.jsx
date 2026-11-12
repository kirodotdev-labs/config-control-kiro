/**
 * @fileoverview Code intelligence for a Workspace (Kiro CLI V3). Kiro has two
 * layers: tree-sitter, built in for 18 languages with nothing to set up, and
 * optional language servers configured per Workspace in
 * .kiro/settings/lsp.json. This page explains both, detects the project's
 * languages, shows which servers are installed (with the install command
 * when not), creates lsp.json with Kiro's own defaults, and edits each
 * server as a card beside the file's JSON, kept in sync. Deleting lsp.json
 * is how Kiro turns language servers off. Source: kiro.dev/docs/tools/code-intelligence.
 */
import { useCallback, useState } from 'react';
import { Alert, Box, Button, Checkbox, Chip, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material';
import { Add, Code, DeleteOutlined, OpenInNew, Settings } from '@mui/icons-material';
import { useFileText, useSaveFile, useDeleteFile } from '../../data/useFiles';
import { useCodeIntel, useSystemInfo } from '../../data/useSystem';
import { useScopeSettings } from '../../data/useSettings';
import { errorMessage } from '../../data/errors';
import useJsonDocument from '../../hooks/useJsonDocument';
import { useEditorGuard } from '../../contexts/UnsavedChangesContext';
import { formatJson, isObject, parseJson, setField } from '../../domain/json.js';
import { CODE_COMMANDS, LSP_DEFAULTS, LSP_FIELDS, installFor, lspFileFor, lspLanguages, lspProblems } from '../../domain/lsp.js';
import { EditorFrame, EditStatus, SaveButton } from '../../ui/EditorFrame';
import { CodeEditor } from '../../ui/CodeEditor';
import { SplitPane } from '../../ui/SplitPane';
import { SectionCard } from '../../ui/SectionCard';
import { ListInput } from '../../ui/ListInput';
import { Loading, ErrorState } from '../../ui/States';
import { useConfirm } from '../../ui/ConfirmProvider';
import { useNotify } from '../../ui/NotifyProvider';
import { TerminalButton } from '../launcher/TerminalButton';
import { CommandPreview } from '../launcher/CommandPreview';

const DOCS = 'https://kiro.dev/docs/tools/code-intelligence/';
const TREE_SITTER = 'Bash, C, C++, C#, Elixir, Go, Java, JavaScript, Kotlin, Lua, PHP, Python, Ruby, Rust, Scala, Swift, TSX, TypeScript';
const validate = (v) => (!isObject(v) ? 'lsp.json must be a JSON object' : v.languages !== undefined && !isObject(v.languages) ? '"languages" must be an object of language servers' : '');

/**
 * @param {Object} props
 * @param {{path: string}} props.node lsp.json for the active Workspace.
 * @param {() => void} props.onOpenSettings
 */
export function LspView({ node, onOpenSettings }) {
  const file = useFileText(node.path, true, true); // read, not the navigator's flag: it changes here when lsp.json is created or deleted
  if (file.isLoading) return <Loading />;
  if (file.isError) return <ErrorState message={errorMessage(file.error)} onRetry={file.refetch} />;
  const exists = file.data?.exists !== false;
  const { value } = parseJson(exists ? file.data?.content || '{}' : '{}');
  return <LspBody key={`${node.path}:${exists}`} path={node.path} exists={exists} loaded={isObject(value) ? value : {}} onOpenSettings={onOpenSettings} />;
}

function LspBody({ path, exists, loaded, onOpenSettings }) {
  const { doc, setDoc, text, setText, error, dirty, markSaved } = useJsonDocument(loaded, path, validate);
  const save = useSaveFile();
  const remove = useDeleteFile();
  const confirm = useConfirm();
  const notify = useNotify();
  const settings = useScopeSettings();
  const { data: sys } = useSystemInfo();
  const langs = lspLanguages(doc);
  const commands = [...Object.values(LSP_DEFAULTS).map((d) => d.entry.command), ...Object.values(langs).map((l) => l?.command).filter((c) => typeof c === 'string')];
  const info = useCodeIntel(commands).data;
  const installed = (c) => info?.installed?.[c];
  const detected = info?.detected || [];
  const [picked, setPicked] = useState(null); // languages chosen for a new lsp.json
  const choice = picked ?? Object.keys(LSP_DEFAULTS).filter((id) => detected.includes(id));
  const [customId, setCustomId] = useState('');
  const setLangs = (next) => setDoc(setField(doc, 'languages', next));
  const setLang = (id, key, v) => setLangs({ ...langs, [id]: setField(langs[id] || {}, key, v) });
  const on = exists || Object.keys(langs).length > 0;
  const enabled = settings.workspace?.['chat.enableCodeIntelligence'] ?? settings.global?.['chat.enableCodeIntelligence'];

  const onSave = useCallback(() => {
    save.mutate({ path, content: `${formatJson(doc)}\n` }, {
      onSuccess: () => { markSaved(doc); notify('lsp.json saved. In a chat, /code init -f restarts the servers with it.', 'success'); },
      onError: (e) => notify(errorMessage(e), 'error'),
    });
  }, [save, path, doc, markSaved, notify]);
  useEditorGuard({ dirty, canSave: dirty && !error && !save.isPending, onSave });

  const create = () => {
    const next = lspFileFor(choice);
    save.mutate({ path, content: `${formatJson(next)}\n` }, {
      onSuccess: () => notify('lsp.json created. Kiro starts these servers in new chats here; /code init -f starts them in a running one.', 'success'),
      onError: (e) => notify(errorMessage(e), 'error'),
    });
  };
  const turnOff = async () => {
    if (!await confirm({ title: 'Turn language servers off?', body: 'Deletes .kiro/settings/lsp.json, which is how Kiro turns them off for this Workspace. The built-in code intelligence keeps working. /code init turns them on again.', confirmLabel: 'Turn off', danger: true })) return;
    remove.mutate(path, { onSuccess: () => notify('Language servers are off for this Workspace', 'success'), onError: (e) => notify(errorMessage(e), 'error') });
  };

  const serverRow = (id, d, configured) => (
    <Stack key={id} direction="row" spacing={1} sx={{ alignItems: 'center', py: 0.5 }} data-lsp-lang={id}>
      {!configured && !exists && <Checkbox size="small" sx={{ p: 0.5 }} checked={choice.includes(id)} slotProps={{ input: { 'aria-label': `Use ${d.label}` } }}
        onChange={(e) => setPicked(e.target.checked ? [...choice, id] : choice.filter((x) => x !== id))} />}
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{d.label}</Typography>
          <Typography variant="caption" sx={{ fontFamily: 'monospace' }} color="text.secondary">{d.entry.command}</Typography>
          {detected.includes(id) && <Chip size="small" color="primary" variant="outlined" label="in this project" />}
          {installed(d.entry.command) === true && <Chip size="small" color="success" variant="outlined" label="installed" />}
          {installed(d.entry.command) === false && <Chip size="small" color="warning" variant="outlined" label="not installed" />}
        </Stack>
        {installed(d.entry.command) === false && <Box sx={{ mt: 0.5 }}><CommandPreview label="Install it" command={installFor(d.install, sys)} /></Box>}
      </Box>
      {exists && !configured && <Button size="small" startIcon={<Add />} onClick={() => setLangs({ ...langs, [id]: structuredClone(d.entry) })}>Add</Button>}
    </Stack>
  );

  const langCard = ([id, l]) => {
    const problems = lspProblems(l);
    const cmd = typeof l?.command === 'string' ? l.command : '';
    const opts = isObject(l?.initialization_options) ? JSON.stringify(l.initialization_options, null, 2) : '';
    return (
      <Box key={id} data-section={`lsp-${id}`}>
        <SectionCard icon={<Code />} title={`${LSP_DEFAULTS[id]?.label || id} · ${l?.name || cmd || id}`} badge={problems.length ? 'check' : ''}
          summary={[cmd, installed(cmd) === false ? 'not installed' : installed(cmd) ? 'installed' : ''].filter(Boolean).join(' · ')}>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1.5}>
              <TextField size="small" label="Name" value={l?.name || ''} onChange={(e) => setLang(id, 'name', e.target.value || undefined)} sx={{ flex: 1 }} helperText={LSP_FIELDS.name} />
              <TextField size="small" label="Command" value={cmd} onChange={(e) => setLang(id, 'command', e.target.value || undefined)} sx={{ flex: 1 }}
                helperText={installed(cmd) === false ? 'Not found on this computer: install it, or give the full path' : LSP_FIELDS.command}
                error={installed(cmd) === false} slotProps={{ input: { sx: { fontFamily: 'monospace' } } }} />
            </Stack>
            <ListInput label="Arguments" value={Array.isArray(l?.args) ? l.args : []} onChange={(v) => setLang(id, 'args', v)} options={['--stdio']} helperText={LSP_FIELDS.args} />
            {['file_extensions', 'file_patterns', 'project_patterns', 'exclude_patterns'].map((k) => (
              <ListInput key={k} label={k.replace(/_/g, ' ')} value={Array.isArray(l?.[k]) ? l[k] : []} onChange={(v) => setLang(id, k, v.length || k !== 'file_patterns' ? v : undefined)} helperText={LSP_FIELDS[k]} />
            ))}
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <TextField size="small" type="number" label="Request timeout (seconds)" value={l?.request_timeout_secs ?? ''} sx={{ width: 220 }}
                onChange={(e) => setLang(id, 'request_timeout_secs', e.target.value === '' ? undefined : Number(e.target.value))} helperText="Default 60" />
              <FormControlLabel control={<Switch size="small" checked={l?.multi_workspace === true} onChange={(e) => setLang(id, 'multi_workspace', e.target.checked)} />} label={LSP_FIELDS.multi_workspace} />
            </Stack>
            <OptionsField key={opts} value={opts} onChange={(v) => setLang(id, 'initialization_options', v)} />
            {problems.map((p) => <Alert key={p} severity="warning">{p}</Alert>)}
            <Box><Button size="small" color="inherit" startIcon={<DeleteOutlined />} onClick={() => { const { [id]: _gone, ...rest } = langs; setLangs(rest); }}>Remove this server</Button></Box>
          </Stack>
        </SectionCard>
      </Box>
    );
  };

  const left = (
    <Stack spacing={1.5} sx={{ p: 2 }}>
      <Typography variant="body2">
        Kiro understands code in two layers. <strong>Built in</strong>, with nothing to set up: symbol search, file outlines, structural search and
        rewrite, and codebase overviews for {TREE_SITTER}. <strong>Language servers</strong>, optional, add find references, go to definition,
        rename across files, errors and hover docs. They are set up per Workspace in <code>.kiro/settings/lsp.json</code>, never in Global.
      </Typography>
      <Alert severity={on ? 'success' : 'info'} variant="outlined" data-testid="lsp-state">
        {on ? 'Language servers are on for this Workspace: Kiro starts the ones below when a chat starts here.' : 'Language servers are off for this Workspace. The built-in layer works anyway.'}
        {detected.length > 0 && <> Languages found in this project: {detected.map((d) => LSP_DEFAULTS[d]?.label || d).join(', ')}.</>}
      </Alert>
      {enabled === false && (
        <Alert severity="warning" action={<Button color="inherit" size="small" startIcon={<Settings />} onClick={onOpenSettings}>Settings</Button>}>
          chat.enableCodeIntelligence is off, so V3 chats don&apos;t use code intelligence at all.
        </Alert>
      )}
      {error && <Alert severity="error" variant="outlined">The JSON has a problem, so the cards show the last good version: {error}</Alert>}

      {!exists && (
        <Box data-section="lsp-setup">
          <SectionCard icon={<Add />} title="Turn on language servers" summary="pick languages, or let Kiro detect them" defaultOpen>
            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary">Ticked: the languages found in this project. Each uses Kiro&apos;s own settings for that server.</Typography>
              {Object.entries(LSP_DEFAULTS).map(([id, d]) => serverRow(id, d, false))}
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Button variant="contained" size="small" disabled={!choice.length || save.isPending} onClick={create}>Create lsp.json ({choice.length})</Button>
                <Typography variant="caption" color="text.secondary">or in a chat: <code>/code init</code>, which detects and writes the same file.</Typography>
              </Stack>
            </Stack>
          </SectionCard>
        </Box>
      )}

      {exists && Object.entries(langs).map(langCard)}
      {exists && (
        <Box data-section="lsp-add">
          <SectionCard icon={<Add />} title="Add a language server" summary="Kiro's built-in ones, or your own">
            <Stack spacing={1}>
              {Object.entries(LSP_DEFAULTS).filter(([id]) => !(id in langs)).map(([id, d]) => serverRow(id, d, false))}
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <TextField size="small" label="Your own: language id" value={customId} onChange={(e) => setCustomId(e.target.value.replace(/[^a-z0-9_-]/gi, '').toLowerCase())} />
                <Button size="small" startIcon={<Add />} disabled={!customId || customId in langs}
                  onClick={() => { setLangs({ ...langs, [customId]: { name: '', command: '', args: ['--stdio'], file_extensions: [], project_patterns: [], exclude_patterns: [], multi_workspace: false, initialization_options: {}, request_timeout_secs: 60 } }); setCustomId(''); }}>Add</Button>
              </Stack>
            </Stack>
          </SectionCard>
        </Box>
      )}

      <Box data-section="lsp-commands">
        <SectionCard icon={<Code />} title="In a chat" summary="/code init · status · overview · summary · logs">
          <Stack spacing={1}>
            {CODE_COMMANDS.map((c) => <CommandPreview key={c.cmd} label={c.what} command={c.cmd} />)}
            <Typography variant="caption" color="text.secondary">
              Ask in plain words: &quot;find references of UserRepository&quot;, &quot;dry run: rename FetchUser to fetchUserData&quot;. A custom agent needs the
              <code> code</code> tool (or @builtin) to use any of this. After editing lsp.json, restart the servers with <code>/code init -f</code>.
            </Typography>
          </Stack>
        </SectionCard>
      </Box>
    </Stack>
  );

  return (
    <EditorFrame icon={<Code />} title="Code intelligence" path={path}
      status={<EditStatus dirty={dirty} error={error} isNew={!exists} />}
      actions={<>
        <Button endIcon={<OpenInNew />} href={DOCS} target="_blank" rel="noopener noreferrer">Guide</Button>
        {exists && <Button color="inherit" startIcon={<DeleteOutlined />} onClick={turnOff} disabled={remove.isPending}>Turn off</Button>}
        {exists && <SaveButton dirty={dirty} valid={!error} saving={save.isPending} onClick={onSave} />}
        <TerminalButton title="Try code intelligence in Kiro CLI V3" disabledReason={dirty ? 'Save first: Kiro reads the saved lsp.json.' : ''}
          hint={exists ? <>Type <code>/code status</code> to see the servers, or <code>/code init -f</code> to restart them.</> : <>Type <code>/code init</code> to set up language servers, or ask for &quot;an overview of this codebase&quot;.</>} />
      </>}>
      {exists ? <SplitPane persistKey="lsp" initial={55} left={left} right={<CodeEditor value={text} onChange={setText} />} /> : <Box sx={{ overflow: 'auto', height: '100%', maxWidth: 900 }}>{left}</Box>}
    </EditorFrame>
  );
}

/** initialization_options as JSON text; only a valid object is applied. */
function OptionsField({ value, onChange }) {
  const [t, setT] = useState(value);
  const [bad, setBad] = useState(false);
  return (
    <TextField size="small" label="Initialization options" multiline minRows={2} maxRows={8} value={t} error={bad}
      helperText={bad ? 'Not a JSON object yet' : LSP_FIELDS.initialization_options}
      slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 12 } } }}
      onChange={(e) => {
        setT(e.target.value);
        if (!e.target.value.trim()) { setBad(false); onChange(undefined); return; }
        const { value: v, error } = parseJson(e.target.value);
        setBad(!!error || !isObject(v));
        if (!error && isObject(v)) onChange(v);
      }} />
  );
}
