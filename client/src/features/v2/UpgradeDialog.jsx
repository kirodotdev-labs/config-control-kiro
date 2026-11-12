/**
 * @fileoverview Upgrades one agent with Kiro's own converter. Kiro runs on a
 * copy first, so the user sees the exact before and after, and Kiro's
 * warnings, before the file changes. The original is kept as a .bak backup.
 */
import { useEffect } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography,
} from '@mui/material';
import { useAgentUpgrade } from '../../data/useV2';
import { errorMessage } from '../../data/errors';
import { CodeEditor } from '../../ui/CodeEditor';
import { Loading } from '../../ui/States';
import { useNotify } from '../../ui/NotifyProvider';

/** @param {{id: string, open: boolean, onClose: () => void}} props */
export function UpgradeDialog({ id, open, onClose }) {
  const { preview, apply } = useAgentUpgrade(id);
  const notify = useNotify();
  const run = preview.mutate;
  const reset = preview.reset;
  useEffect(() => { if (open) run(); else reset(); }, [open, run, reset]);

  const p = preview.data;
  const onApply = () => apply.mutate(p.hash, {
    onSuccess: ({ backup }) => { notify(backup ? 'Agent upgraded. The original is saved as a backup.' : 'Nothing to change.', 'success'); onClose(); },
    onError: (e) => notify(errorMessage(e), 'error'),
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth slotProps={{ paper: { sx: { height: '84vh' } } }}>
      <DialogTitle>Upgrade {id} to V3</DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {preview.isPending && <Loading label="Kiro is converting a copy of this agent…" />}
        {preview.isError && <Alert severity="error">{errorMessage(preview.error)}</Alert>}
        {p && !p.changed && <Alert severity="success">Kiro found nothing to change. This agent is already in the V3 format.</Alert>}
        {p?.changed && (
          <>
            <Typography variant="body2" color="text.secondary">
              Kiro adds V3 permission rules and keeps your CLI 2.x fields, so the agent works in both versions. Nothing is
              written until you choose Upgrade.
            </Typography>
            <Box sx={{ flexGrow: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              <Stack sx={{ minHeight: 0 }}><Typography variant="caption">Now</Typography><CodeEditor value={p.before} readOnly /></Stack>
              <Stack sx={{ minHeight: 0 }}><Typography variant="caption">After the upgrade</Typography><CodeEditor value={p.after} readOnly /></Stack>
            </Box>
          </>
        )}
        {p?.output && (
          <Box component="pre" sx={{ m: 0, p: 1.5, bgcolor: 'action.hover', borderRadius: 1, fontSize: 12, maxHeight: 140, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
            {p.output}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1, px: 1 }}>
          You can undo this with Restore original.
        </Typography>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!p?.changed || apply.isPending} onClick={onApply}>
          {apply.isPending ? 'Upgrading…' : 'Upgrade'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
