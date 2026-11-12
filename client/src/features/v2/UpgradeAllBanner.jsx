/**
 * @fileoverview Shown above the agent list only when some agents still need
 * Kiro's V3 upgrade. "Preview" runs Kiro's dry run; "Upgrade all" runs it for
 * real (Kiro keeps a .bak of every file it changes).
 */
import { useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack } from '@mui/material';
import { useUpgradeAll } from '../../data/useV2';
import { useKiroStatus, kiroBlocker } from '../../data/useKiro';
import { useScopeSettings } from '../../data/useSettings';
import { autoUpgrades } from '../../domain/v2.js';
import { errorMessage } from '../../data/errors';
import { useConfirm } from '../../ui/ConfirmProvider';
import { useNotify } from '../../ui/NotifyProvider';

/** @param {{agents: Object[], scopeLabel: string}} props */
export function UpgradeAllBanner({ agents, scopeLabel }) {
  const pending = agents.filter((a) => a.v3?.state && a.v3.state !== 'v3');
  const blocked = pending.filter((a) => a.v3.state === 'blocked').length;
  const { data: status } = useKiroStatus();
  const { global } = useScopeSettings();
  const auto = autoUpgrades(global, status?.version);
  const run = useUpgradeAll();
  const confirm = useConfirm();
  const notify = useNotify();
  const [report, setReport] = useState(null);
  if (!pending.length) return null;
  const blocker = kiroBlocker(status, 'upgrade');

  const go = async (dryRun) => {
    if (!dryRun && !await confirm({
      title: `Upgrade every agent in ${scopeLabel}?`, confirmLabel: 'Upgrade all',
      body: 'Kiro converts each JSON agent that needs it and saves the original next to it as a .bak file. Markdown agents are not changed.',
    })) return;
    run.mutate(dryRun, {
      onSuccess: ({ output }) => (dryRun ? setReport(output || 'Kiro reported no changes.') : notify('Agents upgraded by Kiro', 'success')),
      onError: (e) => notify(errorMessage(e), 'error'),
    });
  };

  return (
    <>
      <Alert severity={blocked && !auto ? 'error' : auto ? 'info' : 'warning'} action={(
        <Stack direction="row" spacing={1}>
          <Button color="inherit" size="small" disabled={!!blocker || run.isPending} onClick={() => go(true)}>Preview</Button>
          <Button color="inherit" size="small" variant="outlined" disabled={!!blocker || run.isPending} onClick={() => go(false)}>Upgrade all</Button>
        </Stack>
      )}>
        {pending.length} of {agents.length} agents use CLI 2.x settings.
        {auto ? ' Kiro upgrades them by itself the next time a V3 chat starts here, keeping each original as a .bak file. Upgrade all does it now.'
          : blocked ? ` Kiro won't upgrade them by itself here, so V3 chats start the default agent instead of ${blocked === 1 ? 'one of them' : `${blocked} of them`} until you upgrade.` : ''}
        {blocker && ` ${blocker}`}
      </Alert>
      <Dialog open={!!report} onClose={() => setReport(null)} maxWidth="md" fullWidth>
        <DialogTitle>What Kiro would change</DialogTitle>
        <DialogContent dividers>
          <Box component="pre" sx={{ m: 0, fontSize: 12, whiteSpace: 'pre-wrap' }}>{report}</Box>
        </DialogContent>
        <DialogActions><Button onClick={() => setReport(null)}>Close</Button></DialogActions>
      </Dialog>
    </>
  );
}
