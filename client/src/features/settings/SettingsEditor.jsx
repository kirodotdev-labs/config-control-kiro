/**
 * @fileoverview Edits Kiro CLI settings (settings/cli.json): a form built
 * from the settings this kiro-cli supports on the left, the file's JSON on
 * the right, kept in sync. Only settings you change are written; everything
 * else uses Kiro's default (or, in a Workspace, the Global value).
 */
import { useCallback, useState } from 'react';
import { Alert, Box, Button, Divider, FormControlLabel, InputAdornment, Stack, Switch, TextField, Typography } from '@mui/material';
import { Search, Tune } from '@mui/icons-material';
import { useFileText, useSaveFile } from '../../data/useFiles';
import { useKiroStatus, useSettingsCatalog } from '../../data/useKiro';
import { useSystemInfo } from '../../data/useSystem';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { errorMessage } from '../../data/errors';
import useJsonDocument from '../../hooks/useJsonDocument';
import { useEditorGuard } from '../../contexts/UnsavedChangesContext';
import { formatJson, isObject, parseJson, setField } from '../../domain/json.js';
import { effectiveEngine, groupSettings, settingsErrors } from '../../domain/settings.js';
import { EditorFrame, EditStatus, SaveButton } from '../../ui/EditorFrame';
import { CodeEditor } from '../../ui/CodeEditor';
import { SplitPane } from '../../ui/SplitPane';
import { SectionCard } from '../../ui/SectionCard';
import { ErrorState, Loading } from '../../ui/States';
import { useNotify } from '../../ui/NotifyProvider';
import { FileEditor } from '../files/FileEditor';
import { SettingRow } from './SettingRow';

const validate = (v) => (isObject(v) ? '' : 'cli.json must be a JSON object');

/** @param {{path: string, exists: boolean}} props */
export function SettingsEditor({ path, exists }) {
  const file = useFileText(path, exists);
  const { isWorkspaceMode } = useWorkspace();
  const { data: info } = useSystemInfo();
  const globalPath = isWorkspaceMode && info?.globalPath ? `${info.globalPath}/settings/cli.json` : '';
  const global = useFileText(globalPath, !!globalPath, true);
  // Just saved a new file: the content is cached before the navigator learns it exists.
  const missing = !file.data && (!exists || file.error?.response?.status === 404);
  if (exists && file.isLoading) return <Loading />;
  if (file.isError && !missing) return <ErrorState message={errorMessage(file.error)} onRetry={file.refetch} />;
  const { value, error } = parseJson(missing ? '{}' : file.data.content || '{}');
  if (error || !isObject(value)) {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Alert severity="warning" sx={{ m: 2, mb: 0 }}>cli.json isn&apos;t a valid JSON object, so it opens as text. Fix it to use the settings form.</Alert>
        <Box sx={{ flexGrow: 1, minHeight: 0 }}><FileEditor path={path} title="cli.json" /></Box>
      </Box>
    );
  }
  const parsedGlobal = global.data ? parseJson(global.data.content || '{}').value : undefined;
  return <SettingsForm path={path} loaded={value} isNew={missing} globalValues={isObject(parsedGlobal) ? parsedGlobal : {}} />;
}

function SettingsForm({ path, loaded, isNew, globalValues }) {
  const { isWorkspaceMode } = useWorkspace();
  const catalog = useSettingsCatalog();
  const { data: status } = useKiroStatus();
  const save = useSaveFile();
  const notify = useNotify();
  const [query, setQuery] = useState('');
  const [onlySet, setOnlySet] = useState(false);
  const [focus, setFocus] = useState('');
  const [reveal, setReveal] = useState({ key: '', n: 0 }); // the setting the JSON cursor asked to show
  const { doc, setDoc, text, setText, error, dirty, markSaved } = useJsonDocument(loaded, path, validate);
  const onCursorKey = useCallback(([key]) => {
    if (!key) return;
    setFocus(key);
    setQuery(''); setOnlySet(false); // a filter must not hide the row
    setReveal((r) => ({ key, n: r.n + 1 }));
  }, []);

  // The engine is Global only: in a Workspace, the Global file decides.
  const engineValues = isWorkspaceMode ? globalValues : doc;
  const engine = effectiveEngine(engineValues, status?.version);
  const engineSource = engineValues['chat.agentEngine'] ? `chat.agentEngine is ${engine}` : `Kiro CLI ${status?.version || ''} defaults to 2.x`;
  const known = catalog.data?.settings || [];
  const errors = settingsErrors(known, doc);
  const firstError = error || Object.entries(errors).map(([k, e]) => `${k}: ${e}`)[0] || '';
  const groups = groupSettings(known, { query, onlySet, values: doc });
  const unknown = Object.keys(doc).filter((k) => !known.some((s) => s.key === k));
  const setCount = Object.keys(doc).length;

  const onSave = useCallback(() => {
    save.mutate({ path, content: `${formatJson(doc)}\n` }, {
      onSuccess: () => { markSaved(doc); notify('Settings saved. New Kiro chats use them.', 'success'); },
      onError: (e) => notify(errorMessage(e), 'error'),
    });
  }, [save, path, doc, markSaved, notify]);
  useEditorGuard({ dirty, canSave: dirty && !firstError && !save.isPending, onSave });

  const row = (s) => (
    <SettingRow key={s.key} setting={s} value={doc[s.key]} globalValue={globalValues[s.key]} isWorkspace={isWorkspaceMode}
      error={errors[s.key] || ''} onFocus={() => setFocus(s.key)} onChange={(v) => setDoc(setField(doc, s.key, v))} active={focus === s.key} reveal={reveal.key === s.key ? reveal.n : 0} />
  );

  return (
    <EditorFrame icon={<Tune />} title="Kiro CLI settings" path={path}
      status={<EditStatus dirty={dirty} error={firstError} isNew={isNew} />}
      actions={<SaveButton dirty={dirty} valid={!firstError} saving={save.isPending} onClick={onSave} />}>
      <SplitPane persistKey="settings" initial={58}
        left={(
          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Typography variant="body2" color="text.secondary">
              {isWorkspaceMode
                ? 'These settings apply to Kiro CLI chats started in this workspace and override Global. Anything not set here uses the Global value, or Kiro\'s default.'
                : 'These settings apply to every Kiro CLI chat on this computer. Change only what you need: anything not set uses Kiro\'s default and isn\'t written to the file.'}
              {` ${setCount} set in this file.`}
            </Typography>
            {engine !== 'v3' && (
              <Alert severity="info" data-testid="engine-advice"
                action={isWorkspaceMode ? null : <Button color="inherit" onClick={() => setDoc(setField(doc, 'chat.agentEngine', 'v3'))}>Use V3</Button>}>
                Plain kiro-cli chats start with the 2.x engine ({engineSource}). Kiro CLI V3 is the current engine.
                {isWorkspaceMode
                  ? ' The engine is a Global setting: change it in Global Settings, since a Workspace value has no effect.'
                  : ' Choose Use V3, then Save.'}
                {' '}Chats this app opens already use V3.
              </Alert>
            )}
            {catalog.data?.problem && (
              <Alert severity="warning">
                Couldn&apos;t get the list of settings from Kiro CLI. {catalog.data.problem.message} {catalog.data.problem.fix} You can still edit the
                file in the JSON on the right.
              </Alert>
            )}
            <Stack direction="row" spacing={2} alignItems="center">
              <TextField size="small" fullWidth placeholder="Search settings" value={query} onChange={(e) => setQuery(e.target.value)}
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> } }} />
              <FormControlLabel sx={{ flexShrink: 0 }} label="Only changed"
                control={<Switch size="small" checked={onlySet} onChange={(e) => setOnlySet(e.target.checked)} />} />
            </Stack>
            {catalog.isLoading && <Loading label="Asking Kiro CLI for its settings…" />}
            {groups.map((g) => {
              const changed = g.settings.filter((s) => s.key in doc).length;
              return (
                <SectionCard key={`${g.name}:${query}:${onlySet}`} icon={<Tune />} title={g.name}
                  summary={`${g.settings.length} settings${changed ? ` · ${changed} changed` : ''}`}
                  badge={g.settings.some((s) => errors[s.key]) ? 'invalid' : ''}
                  defaultOpen={!!query || onlySet || (changed > 0 && g.name !== 'Advanced')}>
                  <Stack divider={<Divider flexItem />}>{g.settings.map(row)}</Stack>
                </SectionCard>
              );
            })}
            {unknown.length > 0 && (
              <SectionCard icon={<Tune />} title="Not known to this Kiro CLI" summary={`${unknown.length} kept as they are`} defaultOpen>
                <Typography variant="caption" color="text.secondary">
                  These keys may come from a newer or older Kiro. They are saved unchanged; edit them in the JSON.
                </Typography>
                {unknown.map((k) => <Typography key={k} variant="body2" sx={{ fontFamily: 'monospace' }}>{k}</Typography>)}
              </SectionCard>
            )}
          </Box>
        )}
        right={<CodeEditor value={text} onChange={setText} highlightKey={focus && focus in doc ? focus : ''} onCursorKey={onCursorKey} />}
      />
    </EditorFrame>
  );
}
