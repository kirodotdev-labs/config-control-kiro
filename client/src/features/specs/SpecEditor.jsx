/**
 * @fileoverview One spec on one page, like a power: cards on the left, a
 * document on the right. The cards: what kind of spec it is (Kiro's
 * .config.kiro, which the spec agents read), its documents in the order
 * the kind writes them (missing ones can be started from a template), the
 * task list from tasks.md with each task ticked here, and how to carry on
 * with Kiro. Clicking a card or a document shows its file on the right;
 * cards and files stay in sync, and one Save writes every changed file.
 *
 * Kiro decides which phase is done from which documents exist, so the page
 * never makes a later document from a template: Kiro writes those. Each step
 * is offered as an action that opens a chat with exactly what to type: write
 * the next document, rewrite one, update the ones after an edited document,
 * run one task, or run all unticked tasks. Deleting a document lets Kiro
 * write it again. Source: kiro.dev/docs/specs.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Checkbox, Chip, IconButton, LinearProgress, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { Article, AutoAwesome, Category, DeleteOutlined, Description, FolderOpen, PlayArrow, TaskAlt } from '@mui/icons-material';
import { useDeleteFile, useFileText, useSaveFile } from '../../data/useFiles';
import { errorMessage } from '../../data/errors';
import { useEditorGuard } from '../../contexts/UnsavedChangesContext';
import { SPEC_DOCS, SPEC_KINDS, parseTasks, readSpecConfig, setTaskDone, specAction, specCommands, specKindOf, specTemplate, taskProgress, writeSpecConfig } from '../../domain/specs.js';
import { EditorFrame, EditStatus, SaveButton } from '../../ui/EditorFrame';
import { CodeEditor } from '../../ui/CodeEditor';
import { SplitPane } from '../../ui/SplitPane';
import { SectionCard } from '../../ui/SectionCard';
import { Loading } from '../../ui/States';
import { useConfirm } from '../../ui/ConfirmProvider';
import { useNotify } from '../../ui/NotifyProvider';
import { TerminalButton } from '../launcher/TerminalButton';
import { CommandPreview } from '../launcher/CommandPreview';
import { DeleteFileButton } from '../files/DeleteFileButton';
import { useSpecs } from './SpecsView';

const CONFIG = '.config.kiro';
const LANGUAGE = { json: 'json', kiro: 'json', yaml: 'yaml', yml: 'yaml', md: 'markdown' };

/**
 * @param {Object} props
 * @param {{name: string, path: string}} props.node the spec.
 * @param {string} [props.file] the document to show (from the navigator).
 * @param {Object} [props.fileChoice] changes on each navigator click.
 * @param {() => void} props.onGone it was deleted.
 */
export function SpecEditor({ node, file, fileChoice, onGone }) {
  const { specs } = useSpecs();
  const spec = specs.find((s) => s.name === node.name);
  const files = (spec?.children || []).map((f) => f.name);
  const configQ = useFileText(`${node.path}/${CONFIG}`, true, true);
  if (configQ.isLoading) return <Loading />;
  return <SpecBody key={node.path} name={node.name} dir={node.path} files={files} configText={configQ.data?.content ?? ''}
    configExists={configQ.data?.exists !== false} file={file} fileChoice={fileChoice} onGone={onGone} />;
}

function SpecBody({ name, dir, files, configText, configExists, file, fileChoice, onGone }) {
  const kindNow = specKindOf(readSpecConfig(configText), files);
  const firstDoc = (kindNow?.docs || ['requirements.md', 'bugfix.md', 'design.md', 'tasks.md']).find((d) => files.includes(d)) || files[0] || 'tasks.md';
  const [active, setActive] = useState(file || firstDoc);
  useEffect(() => { if (file) setActive(file); }, [file, fileChoice]);
  const [drafts, setDrafts] = useState({});
  const activeQ = useFileText(`${dir}/${active}`, active !== CONFIG, true);
  const tasksQ = useFileText(`${dir}/tasks.md`, true, true);
  const loaded = (rel) => (rel === CONFIG ? configText : rel === 'tasks.md' ? tasksQ.data?.content : rel === active ? activeQ.data?.content : '') ?? '';
  const textOf = (rel) => drafts[rel]?.text ?? loaded(rel);
  const setText = (rel, text) => setDrafts((d) => ({ ...d, [rel]: { text, base: d[rel]?.base ?? loaded(rel), isNew: d[rel]?.isNew } }));
  const startDoc = (rel) => { setDrafts((d) => ({ ...d, [rel]: { text: specTemplate(rel, name), base: '', isNew: true } })); setActive(rel); };
  const changed = Object.entries(drafts).filter(([, d]) => d.text !== d.base).map(([rel]) => rel);
  const dirty = changed.length > 0;
  const save = useSaveFile();
  const remove = useDeleteFile();
  const confirm = useConfirm();
  const notify = useNotify();

  const config = readSpecConfig(textOf(CONFIG));
  const shown = [...new Set([...files, ...Object.keys(drafts).filter((r) => r !== CONFIG)])];
  const kind = specKindOf(config, shown);
  const docs = kind ? kind.docs : ['requirements.md', 'design.md', 'tasks.md'];
  const others = shown.filter((f) => !docs.includes(f) && !['requirements.md', 'bugfix.md', 'design.md', 'tasks.md'].includes(f));
  const strays = shown.filter((f) => !docs.includes(f) && ['requirements.md', 'bugfix.md'].includes(f));
  const tasksText = textOf('tasks.md');
  const tasks = parseTasks(tasksText);
  const progress = taskProgress(tasksText);
  const hasTasks = shown.includes('tasks.md');

  const onSave = useCallback(async () => {
    try {
      for (const rel of changed) await save.mutateAsync({ path: `${dir}/${rel}`, content: drafts[rel].text });
      setDrafts({});
      notify('Saved. Kiro reads the spec as it is now.', 'success');
    } catch (e) { notify(errorMessage(e), 'error'); }
  }, [changed, drafts, save, dir, notify]);
  useEditorGuard({ dirty, canSave: dirty && !save.isPending, onSave });

  const cardOf = (rel) => (rel === CONFIG ? 'kind' : rel === 'tasks.md' ? 'tasks' : docs.includes(rel) || strays.includes(rel) ? 'docs' : 'files');
  const activeCard = cardOf(active);
  const changedChip = (rel) => drafts[rel] && drafts[rel].text !== drafts[rel].base && <Chip size="small" variant="outlined" label={drafts[rel].isNew ? 'new' : 'changed'} />;
  /** A step for Kiro: opens a chat here and says what to type. */
  const kiro = (act, opts, label, size = 'small') => {
    const a = specAction(act, name, opts);
    return (
      <TerminalButton size={size} label={label} title={a.title} tip={a.title}
        disabledReason={dirty ? 'Save first: Kiro reads the saved files.' : ''}
        hint={<Stack spacing={0.75}><span>In the chat, type:</span>{a.lines.map((l) => <CommandPreview key={l} command={l} />)}</Stack>} />
    );
  };
  const deleteDoc = async (rel) => {
    if (!await confirm({ title: `Delete ${rel}?`, body: `Kiro then treats this step as not done, so "Write with Kiro" writes it again. This can't be undone.`, confirmLabel: 'Delete', danger: true })) return;
    remove.mutate(`${dir}/${rel}`, {
      onSuccess: () => { setDrafts(({ [rel]: _gone, ...rest }) => rest); setActive(firstDoc === rel ? CONFIG : firstDoc); notify(`${rel} deleted`, 'success'); },
      onError: (e) => notify(errorMessage(e), 'error'),
    });
  };
  const nextToWrite = docs.find((d) => !shown.includes(d));
  const docRow = (rel, step) => {
    const exists = shown.includes(rel);
    const i = docs.indexOf(rel);
    const later = i >= 0 ? docs.slice(i + 1).filter((d) => shown.includes(d)) : [];
    const edited = drafts[rel] && drafts[rel].text !== drafts[rel].base;
    return (
      <Box key={rel} data-spec-doc={rel} sx={{ borderRadius: 1, bgcolor: active === rel ? 'action.selected' : 'transparent' }}>
        <Stack direction="row" spacing={1} onClick={exists ? () => setActive(rel) : undefined}
          sx={{ alignItems: 'center', px: 1, py: 0.75, cursor: exists ? 'pointer' : 'default', '&:hover': exists ? { bgcolor: 'action.hover' } : {} }}>
          {step && <Typography variant="caption" color="text.secondary" sx={{ width: 16 }}>{step}</Typography>}
          <Article fontSize="small" sx={{ color: exists ? 'primary.main' : 'text.disabled' }} />
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', color: exists ? 'text.primary' : 'text.secondary' }}>{rel}{!exists && ' · not written yet'}</Typography>
            <Typography variant="caption" color="text.secondary">{SPEC_DOCS[rel] || ''}</Typography>
          </Box>
          {changedChip(rel)}
          {exists && i >= 0 && (
            <Tooltip title={`Delete ${rel}, so Kiro writes it again`}>
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); deleteDoc(rel); }} aria-label={`Delete ${rel}`}><DeleteOutlined fontSize="small" /></IconButton>
            </Tooltip>
          )}
        </Stack>
        <Stack direction="row" spacing={1} sx={{ px: 1, pb: 0.75, pl: step ? 4.5 : 1, flexWrap: 'wrap', rowGap: 0.5 }} onClick={(e) => e.stopPropagation()}>
          {!exists && rel === nextToWrite && kiro('write', { doc: rel }, 'Write with Kiro')}
          {!exists && i === 0 && <Chip size="small" clickable variant="outlined" label="Write it yourself" onClick={() => startDoc(rel)} />}
          {exists && i >= 0 && kiro('redo', { doc: rel }, 'Rewrite with Kiro')}
          {exists && later.length > 0 && kiro('after', { doc: rel, later }, `Update ${later.join(', ')} with Kiro`)}
        </Stack>
        {edited && later.length > 0 && (
          <Typography variant="caption" color="warning.main" sx={{ display: 'block', px: 1, pb: 0.75, pl: step ? 4.5 : 1 }}>
            You changed {rel}. Save, then use Update {later.join(', ')} with Kiro so they match it.
          </Typography>
        )}
      </Box>
    );
  };

  const cards = [
    { id: 'kind', file: CONFIG, icon: <Category />, title: 'What kind of spec', summary: kind ? kind.label : 'Not set: Kiro asks when you resume it', open: !kind, body: (
      <Stack spacing={1}>
        <TextField select size="small" label="Kind" value={kind?.id || ''} onChange={(e) => setText(CONFIG, writeSpecConfig(textOf(CONFIG), SPEC_KINDS.find((k) => k.id === e.target.value)))}
          helperText={kind ? kind.what : 'Choose one so Kiro knows which documents to write and in what order.'}>
          {SPEC_KINDS.map((k) => <MenuItem key={k.id} value={k.id}>{k.label}</MenuItem>)}
        </TextField>
        <Typography variant="caption" color="text.secondary">
          Saved in {CONFIG}, the file Kiro&apos;s spec agents read ({configExists ? 'Kiro wrote it' : 'created when you save'}).
          {kind && <> Kiro writes {kind.docs.join(', then ')}.</>}
        </Typography>
      </Stack>
    ) },
    { id: 'docs', file: docs.find((d) => shown.includes(d)) || docs[0], icon: <Description />, title: 'Documents', open: true,
      summary: `${docs.filter((d) => shown.includes(d)).length} of ${docs.length} written`, body: (
      <Stack spacing={0.25}>
        <Typography variant="caption" color="text.secondary">
          In the order Kiro writes them. Select one to edit it on the right. Kiro knows a step is done when its document exists, so it writes the
          later ones: use the buttons to have it write, rewrite, or update what comes after an edit.
        </Typography>
        {docs.map((d, i) => docRow(d, String(i + 1)))}
        {strays.map((d) => <Box key={d}>{docRow(d)}<Typography variant="caption" color="warning.main" sx={{ pl: 4 }}>Not used by this kind of spec.</Typography></Box>)}
      </Stack>
    ) },
    { id: 'tasks', file: 'tasks.md', icon: <TaskAlt />, title: 'Tasks', open: tasks.length > 0,
      summary: hasTasks ? (progress.total ? `${progress.done} of ${progress.total} done` : 'No tasks in tasks.md yet') : 'tasks.md not written yet', body: (
      <Stack spacing={0.5}>
        {progress.total > 0 && <LinearProgress variant="determinate" value={(100 * progress.done) / progress.total} sx={{ height: 5, borderRadius: 2 }} />}
        {tasks.map((t) => (
          <Stack key={t.line} direction="row" spacing={0.5} sx={{ alignItems: 'center', pl: t.depth * 3 }} data-task={t.num}>
            <Checkbox size="small" checked={t.done} sx={{ p: 0.5 }} slotProps={{ input: { 'aria-label': `Task ${t.num}` } }}
              onChange={(e) => { setText('tasks.md', setTaskDone(tasksText, t.line, e.target.checked)); setActive('tasks.md'); }} />
            <Typography variant="body2" sx={{ textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'text.secondary' : 'text.primary', flexGrow: 1 }}>
              <Box component="span" sx={{ fontFamily: 'monospace', mr: 1 }}>{t.num}</Box>{t.title}
            </Typography>
            {t.optional && <Tooltip title="Optional (marked *): Kiro skips it unless you ask for optional tasks too"><Chip size="small" variant="outlined" label="optional" /></Tooltip>}
            {kiro('task', { task: t.num }, t.done ? 'Run again' : 'Run')}
          </Stack>
        ))}
        {hasTasks && (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
            {kiro('run', {}, progress.done && progress.done < progress.total ? 'Run the unticked tasks' : 'Run all tasks', 'medium')}
            <Typography variant="caption" color="text.secondary">/spec run runs the tasks that aren&apos;t ticked. To run one again, untick it here, Save, then run.</Typography>
          </Stack>
        )}
        {!hasTasks && <Typography variant="body2" color="text.secondary">Kiro writes tasks.md last, from the documents before it.</Typography>}
        <Typography variant="caption" color="text.secondary">Kiro ticks tasks as it builds; ticking or unticking one here tells Kiro it&apos;s done or still to do. Edit a task&apos;s text on the right.</Typography>
      </Stack>
    ) },
    ...(others.length ? [{ id: 'files', file: others[0], icon: <FolderOpen />, title: 'Other files', summary: `${others.length} file${others.length === 1 ? '' : 's'}`, body: (
      <Stack spacing={0.25}>{others.map((f) => docRow(f))}</Stack>
    ) }] : []),
    { id: 'run', icon: <PlayArrow />, title: 'Carry on with Kiro', summary: `/spec ${name} · /spec run ${name}`, open: true, body: (
      <Stack spacing={1}>
        {specCommands(name, shown.includes('requirements.md')).map((c) => <CommandPreview key={c.cmd} label={c.what} command={c.cmd} />)}
        <Typography variant="caption" color="text.secondary">Press Terminal at the top to open a chat in this Workspace, then type one of these.</Typography>
      </Stack>
    ) },
  ];

  const left = (
    <Stack spacing={1.5} sx={{ p: 2 }}>
      {!kind && !configExists && <Alert severity="info" variant="outlined">This spec has no {CONFIG}. Choose its kind below, or let Kiro ask when you resume it.</Alert>}
      {cards.map((c) => (
        <Box key={c.id} data-section={`spec-${c.id}`}>
          <SectionCard icon={c.icon} title={c.title} summary={c.summary} defaultOpen={c.open}
            active={!!c.file && activeCard === c.id} onActivate={c.file ? () => { if (activeCard !== c.id && (shown.includes(c.file) || c.file === CONFIG)) setActive(c.file); } : undefined}>{c.body}</SectionCard>
        </Box>
      ))}
    </Stack>
  );
  const ext = active.split('.').pop();
  const right = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Typography variant="caption" sx={{ fontFamily: 'monospace', px: 1.5, py: 0.75, borderBottom: 1, borderColor: 'divider' }} data-testid="spec-active-file">{active}</Typography>
      <Box sx={{ flexGrow: 1, minHeight: 0 }}>
        {active !== CONFIG && activeQ.isLoading && !drafts[active]
          ? <Loading />
          : <CodeEditor key={active} value={textOf(active)} onChange={(t) => setText(active, t)} language={LANGUAGE[ext] || 'text'} />}
      </Box>
    </Box>
  );

  return (
    <EditorFrame icon={<AutoAwesome />} title={name} path={dir}
      status={<>
        <EditStatus dirty={dirty} />
        {kind && <Chip size="small" variant="outlined" label={kind.label} sx={{ ml: 0.5 }} />}
      </>}
      actions={<>
        <DeleteFileButton target={{ path: dir, label: `the spec ${name}`, folder: true }} onDeleted={onGone} beforeDelete={() => setDrafts({})} />
        <SaveButton dirty={dirty} saving={save.isPending} onClick={onSave} />
        <TerminalButton title={`Work on ${name} with Kiro CLI V3`} disabledReason={dirty ? 'Save first: Kiro reads the saved files.' : ''}
          hint={<>Type <code>/spec {name}</code> to resume it, or <code>/spec run {name}</code> to run its tasks.</>} />
      </>}>
      <SplitPane persistKey="spec-editor" initial={55} left={left} right={right} />
    </EditorFrame>
  );
}
