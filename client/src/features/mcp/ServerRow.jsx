/**
 * @fileoverview One MCP server: on/off, name and how it starts; expanding it
 * shows its connection fields and live tool list.
 */
import { useEffect, useRef, useState } from 'react';
import { Box, Chip, Collapse, Divider, IconButton, Stack, Switch, Tooltip, Typography } from '@mui/material';
import { Delete, ExpandLess, ExpandMore } from '@mui/icons-material';
import { serverSummary, setEnabled, transportOf } from '../../domain/mcp.js';
import { SURFACE } from '../../theme';
import { ServerFields } from './ServerFields';
import { ServerTools } from './ServerTools';

/**
 * @param {Object} props
 * @param {string} props.name
 * @param {Object} props.cfg
 * @param {(next: Object) => void} props.onChange
 * @param {() => void} props.onRemove
 * @param {() => void} [props.onFocus] e.g. highlight the server in the JSON.
 * @param {boolean} [props.initiallyOpen] start expanded (the server picked in the navigator).
 * @param {number} [props.reveal] bump to open and scroll to this row (the JSON cursor is on it).
 * @param {boolean} [props.active] the row the JSON pane is showing.
 */
export function ServerRow({ name, cfg, onChange, onRemove, onFocus, initiallyOpen, reveal = 0, active = false }) {
  const [open, setOpen] = useState(!!initiallyOpen);
  const ref = useRef(null);
  useEffect(() => { // the JSON cursor landed on this server
    if (!reveal) return;
    setOpen(true);
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [reveal]);
  const enabled = !cfg.disabled;
  return (
    <Box ref={ref} data-server={name} sx={{ border: `1px solid ${active ? 'transparent' : SURFACE.border}`, outline: active ? '2px solid' : 'none', outlineColor: 'primary.main', borderRadius: 2, opacity: enabled ? 1 : 0.7 }} onClickCapture={onFocus}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", px: 1, py: 0.75 }}>
        <Tooltip title={enabled ? 'Turn off' : 'Turn on'}>
          <Switch size="small" checked={enabled} onChange={(e) => onChange(setEnabled(cfg, e.target.checked))} />
        </Tooltip>
        <Box sx={{ flexGrow: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setOpen((o) => !o)}>
          <Stack sx={{ alignItems: "center" }} direction="row" spacing={1}>
            <Typography variant="subtitle2" noWrap>{name}</Typography>
            <Chip size="small" variant="outlined" label={transportOf(cfg) === 'http' ? 'remote' : 'local'} />
          </Stack>
          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', fontFamily: 'monospace' }}>
            {serverSummary(cfg) || 'No command or URL'}
          </Typography>
        </Box>
        <Tooltip title="Remove server"><IconButton size="small" onClick={onRemove}><Delete fontSize="small" /></IconButton></Tooltip>
        <IconButton size="small" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Collapse' : 'Expand'}>
          {open ? <ExpandLess /> : <ExpandMore />}
        </IconButton>
      </Stack>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ px: 2, pb: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <ServerFields cfg={cfg} onChange={onChange} />
          <Divider />
          <ServerTools name={name} cfg={cfg} onChange={onChange} />
        </Box>
      </Collapse>
    </Box>
  );
}
