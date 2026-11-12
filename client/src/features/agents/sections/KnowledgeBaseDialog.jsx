/**
 * @fileoverview Adds or edits one agent knowledge base: a folder Kiro indexes
 * so the agent can search it instead of loading every file. Shows roughly
 * how many files the folder and patterns cover before anything is indexed.
 */
import { useEffect, useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography,
} from '@mui/material';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import { useFolderEstimate } from '../../../data/useKnowledge';
import { errorMessage } from '../../../data/errors';
import { absoluteFolder, entryFromForm, formErrors, formFromEntry, formatBytes } from '../../../domain/knowledge.js';
import { ListInput } from '../../../ui/ListInput';
import { BrowseButton } from '../../files/BrowseButton';

const COMMON_INCLUDES = ['**/*.md', '**/*.txt', '**/*.json', '**/*.py', '**/*.ts', '**/*.js', '**/*.go', '**/*.java'];
const COMMON_EXCLUDES = ['node_modules/**', '.git/**', 'dist/**', 'build/**', 'target/**', 'vendor/**', '*.log'];

function Estimate({ folder, include, exclude }) {
  const { isWorkspaceMode, activeWorkspace } = useWorkspace();
  const est = useFolderEstimate(absoluteFolder(folder, isWorkspaceMode ? activeWorkspace : ''), include, exclude);
  if (!folder.trim()) return null;
  if (est.isError) return <Alert severity="warning" variant="outlined">{errorMessage(est.error)}</Alert>;
  if (!est.data || est.isFetching) return <Typography variant="caption" color="text.secondary">Counting files…</Typography>;
  const { files, bytes, truncated, missing } = est.data;
  if (missing) return <Alert severity="warning" variant="outlined" data-testid="kb-estimate">That folder doesn&apos;t exist on this computer, so there&apos;s nothing to index.</Alert>;
  if (!files) return <Alert severity="warning" variant="outlined" data-testid="kb-estimate">No files match. Check the folder and the patterns.</Alert>;
  return (
    <Alert severity="info" variant="outlined" data-testid="kb-estimate">
      About {truncated ? 'more than ' : ''}{files.toLocaleString('en-US')} file{files === 1 ? '' : 's'} ({formatBytes(bytes)}) would be indexed.
      Kiro indexes them on this computer when a chat starts with this agent, up to Settings → Knowledge → knowledge.maxFiles.
    </Alert>
  );
}

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {Object|null} props.entry the entry to edit, or null to add one
 * @param {Object[]} props.others the agent's other knowledge bases, for the name check
 * @param {() => void} props.onClose
 * @param {(entry: Object) => void} props.onSave
 */
export function KnowledgeBaseDialog({ open, entry, others, onClose, onSave }) {
  const [form, setForm] = useState(() => formFromEntry(entry));
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (open) { setForm(formFromEntry(entry)); setTouched(false); } }, [open, entry]);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const errors = formErrors(form, others);
  const shown = (key) => (touched ? errors[key] : '');

  const submit = () => {
    setTouched(true);
    if (Object.keys(errors).length) return;
    onSave(entryFromForm(form, entry));
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{entry ? 'Edit knowledge base' : 'Add knowledge base'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField size="small" label="Name" value={form.name} onChange={set('name')} autoFocus={!entry}
            error={!!shown('name')} helperText={shown('name') || 'e.g. product-docs'} />
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
            <TextField size="small" fullWidth label="Folder to index" value={form.folder} onChange={set('folder')}
              error={!!shown('folder')} helperText={shown('folder') || 'A full path is safest; a relative one is taken from the folder Kiro starts in.'}
              slotProps={{ input: { sx: { fontFamily: 'monospace' } } }} />
            <BrowseButton mode="directory" initialPath={form.folder} onPick={(p) => setForm({ ...form, folder: p })} />
          </Stack>
          <TextField size="small" label="Description (optional)" value={form.description} onChange={set('description')}
            helperText="Tells the agent what's in it, so it knows when to search." />
          <ListInput label="Only these files (optional)" value={form.include} onChange={(v) => setForm({ ...form, include: v })}
            options={COMMON_INCLUDES} placeholder="e.g. **/*.md, then Enter" helperText="Leave empty to index every file in the folder." />
          <ListInput label="Skip these (optional)" value={form.exclude} onChange={(v) => setForm({ ...form, exclude: v })}
            options={COMMON_EXCLUDES} placeholder="e.g. node_modules/**, then Enter" />
          <TextField select size="small" label="Search type" value={form.indexType} onChange={set('indexType')}
            helperText={form.indexType === 'best'
              ? 'Finds passages by meaning, even in different words. Slower to index; good for documentation.'
              : 'Keyword search. Quick to index; good for code, logs and configuration.'}>
            <MenuItem value="best">Best (by meaning)</MenuItem>
            <MenuItem value="fast">Fast (by keyword)</MenuItem>
          </TextField>
          <FormControlLabel label="Re-index when the agent starts (keeps it up to date, starts slower)"
            control={<Switch checked={form.autoUpdate} onChange={(e) => setForm({ ...form, autoUpdate: e.target.checked })} />} />
          <Estimate folder={form.folder} include={form.include} exclude={form.exclude} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={submit}>{entry ? 'Save' : 'Add'}</Button>
      </DialogActions>
    </Dialog>
  );
}
