/**
 * @fileoverview Adds a project folder as a Workspace. An existing .kiro is
 * adopted; otherwise one is created. Forgetting a workspace later never
 * deletes files.
 */
import { useEffect, useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { errorMessage } from '../../data/errors';
import { PathInput } from '../files/PathInput';
import { BrowseButton } from '../files/BrowseButton';

/** @param {{open: boolean, onClose: () => void, onAdded: (path: string) => void}} props */
export function AddWorkspaceDialog({ open, onClose, onAdded }) {
  const { addWorkspace } = useWorkspace();
  const [path, setPath] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setPath(''); setError(''); } }, [open]);

  const submit = async () => {
    const p = path.trim();
    if (!p) return;
    setBusy(true);
    try {
      await addWorkspace(p);
      onAdded(p);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add a workspace</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Choose a project folder. If it already has a .kiro folder, that one is used. If not, a new one is created.
        </Typography>
        <Stack sx={{ alignItems: "flex-start" }} direction="row" spacing={1}>
          <PathInput autoFocus label="Project folder" value={path} onChange={(v) => { setPath(v); setError(''); }}
            onResolve={(r) => r.valid && r.exists && setPath(r.type === 'directory' ? r.resolvedPath : r.parentPath)}
            helperText={error || ' '} />
          <BrowseButton mode="directory" initialPath={path} title="Choose a project folder" onPick={(p) => { setPath(p); setError(''); }} />
        </Stack>
        {error && <Typography variant="caption" color="error">{error}</Typography>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={!path.trim() || busy}>Add</Button>
      </DialogActions>
    </Dialog>
  );
}
