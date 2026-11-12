/**
 * @fileoverview The agent's Kiro CLI V3 card: Kiro's own verdict on it, what
 * Kiro's upgrade converts (or converted), what V3 doesn't carry over, Upgrade
 * with Kiro, and Restore original while a backup exists. Shown only when
 * there is something to say.
 */
import { useState } from 'react';
import { Alert, AlertTitle, Box, Button, Stack, Typography } from '@mui/material';
import { Restore, Terminal, Upgrade } from '@mui/icons-material';
import { useAgentUpgrade } from '../../data/useV2';
import { useKiroStatus, kiroBlocker } from '../../data/useKiro';
import { useScopeSettings } from '../../data/useSettings';
import { errorMessage } from '../../data/errors';
import { autoUpgrades, v3Status } from '../../domain/v2.js';
import { useConfirm } from '../../ui/ConfirmProvider';
import { useNotify } from '../../ui/NotifyProvider';
import { UpgradeDialog } from './UpgradeDialog';
import { LaunchDialog } from '../launcher/LaunchDialog';
import { launchableAgentError } from '../../domain/launch.js';
import { baseName } from '../files/paths';

/** A titled list of settings, when it has any. */
function SettingList({ title, items }) {
  if (!items?.length) return null;
  return (
    <Box>
      <Typography variant="overline" color="text.secondary">{title}</Typography>
      <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
        {items.map((s) => <Typography key={s} component="li" variant="body2">{s}</Typography>)}
      </Box>
    </Box>
  );
}

/**
 * @param {Object} props
 * @param {string} props.id
 * @param {{state: string, converted?: string[], notCarried?: string[], upgradable: boolean, backup?: string, universal?: boolean, kiro?: string, kiroDetail?: string}} props.v3
 * @param {boolean} props.dirty unsaved edits block upgrading.
 */
export function V3Section({ id, v3, dirty }) {
  const [open, setOpen] = useState(false);
  const [launch2, setLaunch2] = useState(false);
  const { data: status } = useKiroStatus();
  const { global } = useScopeSettings();
  const { restore } = useAgentUpgrade(id);
  const confirm = useConfirm();
  const notify = useNotify();
  const auto = autoUpgrades(global, status?.version);
  const info = v3Status(v3, auto);
  const canUpgrade = v3.state !== 'v3' && v3.kiro !== 'out-of-sync' && v3.kiro !== 'error';
  const blocker = dirty ? 'Save your changes first.' : !v3.upgradable ? 'Kiro upgrades JSON agents only.' : kiroBlocker(status, 'upgrade');
  // Terminal (2.x): only for an agent Kiro hasn't upgraded, which 2.x runs as it is.
  const v2Only = !v3.universal && v3.state !== 'v3';
  const v2Blocker = dirty ? 'Save your changes first.' : kiroBlocker(status, 'sessions') || launchableAgentError(id);

  const onRestore = async () => {
    if (!await confirm({
      title: 'Restore the original?', confirmLabel: 'Restore', danger: true,
      body: `The agent goes back to ${baseName(v3.backup)}, and the backup is removed. Changes made since the upgrade are lost.${auto ? ' Kiro upgrades it again the next time a V3 chat starts.' : ''}`,
    })) return;
    restore.mutate(undefined, {
      onSuccess: () => notify('Original restored', 'success'),
      onError: (e) => notify(errorMessage(e), 'error'),
    });
  };

  return (
    <Stack spacing={1.5}>
      {info && (
        <Alert severity={info.tone}>
          <AlertTitle>{info.title}</AlertTitle>
          {info.text}
          {v3.kiroDetail && v3.kiro === 'error' && <Box sx={{ mt: 0.5, fontFamily: 'monospace', fontSize: 12 }}>{v3.kiroDetail}</Box>}
        </Alert>
      )}
      <SettingList title={v3.universal ? 'What Kiro converted' : 'What Kiro converts'} items={v3.converted} />
      <SettingList title="What V3 doesn't carry over (works only in 2.x chats)" items={v3.notCarried} />
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        {canUpgrade && (
          <Button variant="contained" startIcon={<Upgrade />} disabled={!!blocker} onClick={() => setOpen(true)}>Upgrade with Kiro</Button>
        )}
        {v2Only && (
          <Button variant="outlined" startIcon={<Terminal />} disabled={!!v2Blocker} onClick={() => setLaunch2(true)} title={v2Blocker || `Chat with ${id} in Kiro CLI 2.x`}>
            Terminal (2.x)
          </Button>
        )}
        {v3.backup && (
          <Button startIcon={<Restore />} disabled={dirty || restore.isPending} onClick={onRestore}>Restore original</Button>
        )}
        {blocker && canUpgrade && <Typography variant="caption" color="text.secondary">{blocker}</Typography>}
      </Stack>
      {v3.universal && (
        <Typography variant="caption" color="text.secondary">
          Kiro rebuilds the V3 settings from the 2.x ones. If you change the V3 settings here, Kiro marks the agent Out of sync and stops
          updating them. To check what Kiro thinks, run /upgrade-agent diagnostics in a V3 chat.
        </Typography>
      )}
      <UpgradeDialog id={id} open={open} onClose={() => setOpen(false)} />
      {v2Only && <LaunchDialog open={launch2} onClose={() => setLaunch2(false)} agentId={id} v2 title={`Chat with ${id} in Kiro CLI 2.x`} />}
    </Stack>
  );
}
