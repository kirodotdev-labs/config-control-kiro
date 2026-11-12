/**
 * @fileoverview Whether the agent gets the user's installed Powers
 * (includePowers), and which powers that is right now. A power bundles MCP
 * tools, skills and steering and switches on when a task matches it. Powers
 * are installed for the user in Global only; the list is Kiro's own
 * installed.json, read fresh each time.
 */
import { Alert, Box, Button, Chip, FormControlLabel, Stack, Switch, Typography } from '@mui/material';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import { usePowers } from '../../../data/useKiro';
import { setField } from '../../../domain/json.js';

/**
 * @param {Object} props
 * @param {Object} props.spec
 * @param {(next: Object) => void} props.onChange
 * @param {() => void} [props.onOpenPowers] open Global → Powers (only in Global, where it is).
 */
export function PowersSection({ spec, onChange, onOpenPowers }) {
  const { isWorkspaceMode } = useWorkspace();
  const { data, isLoading } = usePowers();
  const on = spec.includePowers === true;
  const installed = data?.installed || [];
  return (
    <Stack spacing={1.5}>
      <FormControlLabel
        control={<Switch size="small" checked={on} onChange={(e) => onChange(setField(spec, 'includePowers', e.target.checked || undefined))} />}
        label={<Typography variant="body2">Include installed Powers</Typography>} />
      <Typography variant="body2" color="text.secondary">
        A power bundles MCP tools, skills and steering. Kiro switches each one on when your request matches it, so it only takes up
        context when it&apos;s used. Kiro&apos;s default agent always gets them; this agent gets them only with the switch on.
      </Typography>
      <Box>
        <Typography variant="overline" color="text.secondary">Installed now</Typography>
        {isLoading && <Typography variant="body2" color="text.secondary">Reading Kiro&apos;s powers…</Typography>}
        {!isLoading && !installed.length && (
          <Typography variant="body2" color="text.secondary">No powers are installed, so the switch has no effect yet.</Typography>
        )}
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {installed.map((p) => (
            <Chip key={p.name} size="small" variant={on ? 'filled' : 'outlined'} label={p.displayName || p.name} title={p.description || p.name} />
          ))}
        </Stack>
      </Box>
      {data?.unreadable && (
        <Alert severity="warning">
          Kiro&apos;s {data.unreadable} isn&apos;t in a shape this app knows, so this list may be incomplete. Kiro may have changed it:
          update Config Control for Kiro. In a V3 chat, /powers lists them.
        </Alert>
      )}
      {isWorkspaceMode
        ? <Typography variant="caption" color="text.secondary">Powers are installed for you in Global, not per project: manage them under Global → Powers.</Typography>
        : onOpenPowers && <Box><Button size="small" onClick={onOpenPowers}>Install or remove powers</Button></Box>}
    </Stack>
  );
}
