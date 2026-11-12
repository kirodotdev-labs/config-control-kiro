/**
 * @fileoverview The Specs page of a Workspace: the ways to plan with Kiro
 * (feature specs requirements-first or design-first, bugfix specs, quick
 * spec, and plan mode), what each is for, how to start one here or in a
 * chat, and the Workspace's specs with their type and task progress.
 * Specs belong to a project (.kiro/specs/<name>/), so they're Workspace only.
 * Source: kiro.dev/docs/specs.
 */
import { useState } from 'react';
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Add, AutoAwesome, OpenInNew } from '@mui/icons-material';
import { useSurfaces } from '../../data/useSystem';
import { useFileText, useSaveFile } from '../../data/useFiles';
import { errorMessage } from '../../data/errors';
import { PLAN_MODE, SPEC_KINDS, SPEC_NAME, newSpecFiles, readSpecConfig, specKindOf, specSlug, taskProgress } from '../../domain/specs.js';
import { EditorFrame } from '../../ui/EditorFrame';
import { useNotify } from '../../ui/NotifyProvider';
import { SURFACE } from '../../theme';
import { TerminalButton } from '../launcher/TerminalButton';

const DOCS = 'https://kiro.dev/docs/specs/';

/** The specs group node and its spec folders, kept fresh from the navigator data. */
export function useSpecs() {
  const { data } = useSurfaces();
  const group = data?.nodes?.find((n) => n.kind === 'specs');
  return { dir: group?.path || '', specs: (group?.children || []).filter((n) => n.kind === 'spec') };
}

/** One spec in the list: its kind, documents and task progress. */
function SpecRow({ spec, onOpen }) {
  const names = (spec.children || []).map((f) => f.name);
  const config = readSpecConfig(useFileText(`${spec.path}/.config.kiro`, true, true).data?.content);
  const tasks = spec.children?.find((f) => f.name === 'tasks.md');
  const p = taskProgress(useFileText(tasks?.path || '', !!tasks).data?.content);
  const kind = specKindOf(config, names);
  return (
    <Box component="button" type="button" onClick={onOpen} data-spec={spec.name}
      sx={{ all: 'unset', cursor: 'pointer', display: 'block', boxSizing: 'border-box', width: '100%', px: 1, py: 1, borderBottom: `1px solid ${SURFACE.border}`, '&:hover': { bgcolor: 'action.hover' } }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600, flexGrow: 1 }}>{spec.name}</Typography>
        {kind && <Chip size="small" color="primary" variant="outlined" label={kind.label} />}
        {['requirements.md', 'bugfix.md', 'design.md', 'tasks.md'].filter((d) => names.includes(d)).map((d) => <Chip key={d} size="small" variant="outlined" label={d} />)}
      </Stack>
      {tasks && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
          <LinearProgress variant="determinate" value={p.total ? (100 * p.done) / p.total : 0} sx={{ flexGrow: 1, height: 4, borderRadius: 2 }} />
          <Typography variant="caption" color="text.secondary">{p.total ? `${p.done} of ${p.total} tasks done` : 'No tasks yet'}</Typography>
        </Stack>
      )}
    </Box>
  );
}

/**
 * @param {Object} props
 * @param {(node: Object) => void} props.onOpenNode open a spec.
 */
export function SpecsView({ onOpenNode }) {
  const { dir, specs } = useSpecs();
  const [creating, setCreating] = useState(null); // a kind id while the dialog is open
  const open = (name) => onOpenNode({ kind: 'spec', id: `spec:${name}`, name, path: `${dir}/${name}` });
  return (
    <EditorFrame icon={<AutoAwesome />} title="Specs" path={dir}
      actions={<>
        <Button endIcon={<OpenInNew />} href={DOCS} target="_blank" rel="noopener noreferrer">Guide</Button>
        <Button variant="outlined" startIcon={<Add />} onClick={() => setCreating(SPEC_KINDS[0].id)}>New spec</Button>
        <TerminalButton title="Plan or spec with Kiro CLI V3" hint={<>Type <code>/spec new &lt;name&gt;</code> for a spec, or <code>/plan</code> (or Shift+Tab) for plan mode.</>} />
      </>}>
      <Box sx={{ overflow: 'auto', p: 3 }}>
        <Stack spacing={2} sx={{ maxWidth: 900 }}>
          <Typography variant="body1">
            A spec turns an idea into three documents Kiro works from: what to build (requirements, or the bug), how (design), and the
            steps (tasks), in <code>.kiro/specs/&lt;name&gt;/</code>. They live with the code, so specs belong to this Workspace.
            Kiro ticks the tasks off as it builds.
          </Typography>

          <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${SURFACE.border}` }} data-section="specs-list">
            <Typography variant="overline" color="text.secondary">Specs in this Workspace ({specs.length})</Typography>
            {specs.map((s) => <SpecRow key={s.id} spec={s} onOpen={() => open(s.name)} />)}
            {!specs.length && <Typography variant="body2" color="text.secondary">None yet. Pick a way to plan below.</Typography>}
          </Box>

          <Typography variant="overline" color="text.secondary">Ways to plan with Kiro</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 1.5 }}>
            {SPEC_KINDS.map((k) => (
              <Box key={k.id} sx={{ p: 2, borderRadius: 2, border: `1px solid ${SURFACE.border}`, display: 'flex', flexDirection: 'column', gap: 1 }} data-kind={k.id}>
                <Typography variant="subtitle2">{k.label}</Typography>
                <Typography variant="body2">{k.what}</Typography>
                <Typography variant="caption" color="text.secondary"><strong>Best for:</strong> {k.best}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>{k.docs.join(' → ')}</Typography>
                <Box sx={{ flexGrow: 1 }} />
                <Button size="small" variant="outlined" startIcon={<Add />} onClick={() => setCreating(k.id)}>New {k.specType === 'feature' ? 'feature spec' : k.label.toLowerCase()}</Button>
              </Box>
            ))}
            <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${SURFACE.border}`, display: 'flex', flexDirection: 'column', gap: 1 }} data-kind="plan">
              <Typography variant="subtitle2">{PLAN_MODE.label}</Typography>
              <Typography variant="body2">{PLAN_MODE.what}</Typography>
              <Typography variant="caption" color="text.secondary"><strong>Best for:</strong> {PLAN_MODE.best}</Typography>
              <Typography variant="caption" color="text.secondary">In a chat: <code>/plan</code>, <code>/plan &lt;what to build&gt;</code>, or Shift+Tab.</Typography>
              <Box sx={{ flexGrow: 1 }} />
              <TerminalButton size="small" title="Plan mode in Kiro CLI V3"
                hint={<>Type <code>/plan</code> and what you want, e.g. <code>/plan Add a REST API for user sign-in</code>. The prompt shows <code>[plan]</code>; Kiro reads but changes nothing until you approve the plan.</>} />
            </Box>
          </Box>

          <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${SURFACE.border}` }}>
            <Typography variant="overline" color="text.secondary">In a chat</Typography>
            <Typography variant="body2">
              <code>/spec new &lt;name&gt;</code> starts a spec (Kiro asks: Build a Feature, Fix a Bug or Quick Spec). <code>/spec &lt;name&gt;</code> resumes one,
              <code> /spec run &lt;name&gt;</code> runs its tasks (independent ones in parallel), <code>/spec view &lt;name&gt; design</code> shows a document and
              <code> /spec analyze_requirements &lt;name&gt;</code> checks the requirements for gaps. At each phase, Ctrl+X opens the document to comment on it.
            </Typography>
          </Box>
        </Stack>
      </Box>
      <NewSpecDialog kindId={creating} dir={dir} taken={specs.map((s) => s.name)} onClose={() => setCreating(null)}
        onCreated={(name) => { setCreating(null); open(name); }} />
    </EditorFrame>
  );
}

/** New spec: a name and a kind; start the documents here, or let Kiro write them in a chat. */
function NewSpecDialog({ kindId, dir, taken, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState(kindId);
  const [last, setLast] = useState(kindId);
  if (kindId !== last) { setLast(kindId); if (kindId) { setKind(kindId); setName(''); } }
  const save = useSaveFile();
  const notify = useNotify();
  const k = SPEC_KINDS.find((x) => x.id === kind) || SPEC_KINDS[0];
  const n = name.trim();
  const problem = !n ? '' : !SPEC_NAME.test(n) ? 'kebab-case: lowercase letters, numbers and hyphens' : taken.includes(n) ? 'A spec with this name exists' : '';
  const create = async () => {
    try {
      for (const [file, content] of Object.entries(newSpecFiles(n, k))) await save.mutateAsync({ path: `${dir}/${n}/${file}`, content, createOnly: true });
      notify(`${n} created. Fill in ${k.docs[0]}, then use Write with Kiro for the rest.`, 'success');
      onCreated(n);
    } catch (e) { notify(errorMessage(e), 'error'); }
  };
  const pick = { 'requirements-first': 'Build a Feature, then Requirements-First', 'design-first': 'Build a Feature, then Design-First', bugfix: 'Fix a Bug', 'quick-spec': 'Quick Spec' }[k.id];
  return (
    <Dialog open={!!kindId} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>New spec</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <TextField select size="small" label="Kind" value={kind || ''} onChange={(e) => setKind(e.target.value)} helperText={k.what}>
          {SPEC_KINDS.map((x) => <MenuItem key={x.id} value={x.id}>{x.label}</MenuItem>)}
        </TextField>
        <TextField autoFocus size="small" label="Name" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => n && !SPEC_NAME.test(n) && setName(specSlug(n))}
          error={!!problem} helperText={problem || `.kiro/specs/${n || '<name>'}/`} />
        <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: 'action.hover' }}>
          <Typography variant="body2"><strong>Let Kiro write it (recommended):</strong> open a chat, type <code>/spec new {n || '<name>'}</code>, choose <strong>{pick}</strong> and describe it. Kiro writes the documents with you, one phase at a time.</Typography>
          <Box sx={{ mt: 1 }}>
            <TerminalButton size="small" title={`Write ${n || 'the spec'} with Kiro CLI V3`} disabledReason={!n || problem ? 'Give it a name first' : ''}
              hint={<>Type <code>/spec new {n}</code> and choose <strong>{pick}</strong>.</>} />
          </Box>
        </Box>
        <Typography variant="body2" color="text.secondary">
          Or write the first document yourself: this creates {k.docs[0]} from a template and Kiro&apos;s .config.kiro naming the kind. Fill it in,
          then on the spec&apos;s page use <strong>Write with Kiro</strong> for {k.docs.slice(1).join(' and ')}.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!n || !!problem || save.isPending} onClick={create}>Write {k.docs[0]} myself</Button>
      </DialogActions>
    </Dialog>
  );
}
