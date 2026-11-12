/**
 * @fileoverview Lists a server's tools, fetched when this panel is shown.
 * Each tool can be switched off (disabledTools) or set to run without asking
 * (autoApprove).
 */
import { Alert, Box, Button, Checkbox, CircularProgress, Stack, Switch, Tooltip, Typography } from '@mui/material';
import { useServerTools } from '../../data/useMcp';
import useDebounced from '../../hooks/useDebounced';
import { errorMessage } from '../../data/errors';
import { setField, stringList } from '../../domain/json.js';
import { approvesAll, setAutoApprove } from '../../domain/mcp.js';

/**
 * @param {Object} props
 * @param {string} props.name
 * @param {Object} props.cfg
 * @param {(next: Object) => void} props.onChange
 */
export function ServerTools({ name, cfg, onChange }) {
  // Wait for typing to settle so editing a command doesn't start a server per keystroke.
  const query = useServerTools(name, useDebounced(cfg, 700), true);
  const disabled = stringList(cfg.disabledTools);
  const toggle = (tool, on) => onChange(setField(cfg, 'disabledTools', on ? disabled.filter((t) => t !== tool) : [...disabled, tool]));

  if (cfg.disabled) return <Typography variant="body2" color="text.secondary">Turn the server on to see its tools.</Typography>;
  if (query.isLoading) {
    return <Stack sx={{ alignItems: "center" }} direction="row" spacing={1}><CircularProgress size={16} /><Typography variant="body2" color="text.secondary">Starting {name}…</Typography></Stack>;
  }
  const failure = query.isError ? errorMessage(query.error) : query.data?.error;
  if (failure) {
    return (
      <Alert severity="warning" action={<Button size="small" onClick={() => query.refetch()}>Retry</Button>}>
        Couldn&apos;t list this server&apos;s tools: {failure}
      </Alert>
    );
  }
  const tools = query.data?.tools || [];
  if (!tools.length) return <Typography variant="body2" color="text.secondary">This server has no tools.</Typography>;
  return (
    <Box>
      <Stack direction="row">
        <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>{tools.length - disabled.filter((d) => tools.some((t) => t.name === d)).length} of {tools.length} tools on</Typography>
        <Typography variant="caption" color="text.secondary">Without asking</Typography>
      </Stack>
      <Stack sx={{ mt: 0.5, maxHeight: 280, overflow: 'auto' }}>
        {tools.map((t) => (
          <Stack sx={{ alignItems: "center" }} key={t.name} direction="row" spacing={1}>
            <Switch size="small" checked={!disabled.includes(t.name)} onChange={(e) => toggle(t.name, e.target.checked)} />
            <Tooltip title={t.description || ''} placement="right">
              <Typography variant="body2" sx={{ fontFamily: 'monospace', flexGrow: 1, minWidth: 0 }} noWrap>{t.name}</Typography>
            </Tooltip>
            <Tooltip title={approvesAll(cfg) ? 'Every tool runs without asking (autoApprove *)' : 'Run this tool without asking'}>
              <span>
                <Checkbox size="small" disabled={approvesAll(cfg) || disabled.includes(t.name)}
                  checked={approvesAll(cfg) || stringList(cfg.autoApprove).includes(t.name)}
                  onChange={(e) => onChange(setAutoApprove(cfg, t.name, e.target.checked))}
                  slotProps={{ input: { 'aria-label': `Run ${t.name} without asking` } }} />
              </span>
            </Tooltip>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
