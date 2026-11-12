/**
 * @fileoverview Kiro's policy presets for a permissions.yaml: named rule sets
 * listed under "policies:", such as allow-all or approve-for-me. A name this
 * app doesn't know is shown and kept.
 * Source: https://kiro.dev/docs/permissions/ ("Policy presets").
 */
import { Alert, Box, Chip, Stack, Switch, Typography } from '@mui/material';
import { usePermissionsMeta } from '../../data/useSettings';
import { useKiroStatus } from '../../data/useKiro';
import { togglePolicy } from '../../domain/permissions.js';
import { versionAtLeast } from '../../domain/version.js';
import { SURFACE } from '../../theme';

/**
 * @param {Object} props
 * @param {string[]} props.policies
 * @param {(next: string[]) => void} props.onChange
 */
export function PresetsEditor({ policies, onChange }) {
  const { data: meta } = usePermissionsMeta();
  const { data: status } = useKiroStatus();
  const presets = meta?.presets || [];
  const known = new Set(presets.map((p) => p.id));
  const unknown = policies.filter((p) => !known.has(p));
  const row = (id, description, extra) => (
    <Stack key={id} direction="row" spacing={1} sx={{ alignItems: 'center', py: 0.5 }} data-preset={id}>
      <Switch size="small" checked={policies.includes(id)} onChange={(e) => onChange(togglePolicy(policies, id, e.target.checked))}
        slotProps={{ input: { 'aria-label': id } }} />
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{id} {extra}</Typography>
        <Typography variant="caption" color="text.secondary">{description}</Typography>
      </Box>
    </Stack>
  );
  return (
    <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${SURFACE.border}` }}>
      <Typography variant="overline" color="text.secondary">Presets</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Each preset adds a ready-made set of rules at this scope. Your own deny and ask rules still win.
      </Typography>
      {presets.map((p) => row(p.id, p.description, p.since && !versionAtLeast(status?.version, p.since)
        ? <Chip size="small" color="warning" variant="outlined" label={`Needs Kiro CLI ${p.since} or later (you have ${status.version})`} />
        : null))}
      {unknown.map((id) => row(id, "A preset this app doesn't know. It's kept as it is.", null))}
      {policies.includes('allow-all') && (
        <Alert severity="warning" sx={{ mt: 1 }}>
          allow-all lets Kiro use every tool without asking, including files outside the workspace. Keep deny rules
          for anything Kiro must never do.
        </Alert>
      )}
      {policies.includes('approve-for-me') && (
        <Alert severity="info" sx={{ mt: 1 }}>
          With approve-for-me, Kiro decides each action that no rule settles, and asks when it&apos;s unsure. In a chat,
          /permissions → Policies turns it on or off for the Workspace.
        </Alert>
      )}
    </Box>
  );
}
