/**
 * @fileoverview A collapsible form section. Clicking or focusing inside it
 * calls onActivate, which the editors use to highlight the matching JSON.
 */
import { useEffect, useRef, useState } from 'react';
import { Box, Chip, Collapse, IconButton, Stack, Typography } from '@mui/material';
import { ExpandLess, ExpandMore } from '@mui/icons-material';
import { SURFACE } from '../theme';

/**
 * @param {Object} props
 * @param {React.ReactNode} props.icon
 * @param {string} props.title
 * @param {string} [props.summary] one line shown in the header.
 * @param {string} [props.badge] a short warning chip (e.g. "needs upgrade").
 * @param {boolean} [props.active] highlights the card.
 * @param {() => void} [props.onActivate]
 * @param {boolean} [props.defaultOpen]
 * @param {number} [props.reveal] bump this to open the card and scroll it into view (e.g. from the JSON pane).
 * @param {React.ReactNode} props.children
 */
export function SectionCard({ icon, title, summary, badge, active, onActivate, defaultOpen = false, reveal = 0, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef(null);
  useEffect(() => {
    if (!reveal) return;
    setOpen(true);
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [reveal]);
  return (
    <Box
      ref={ref}
      onClickCapture={onActivate} onFocusCapture={onActivate}
      sx={{
        border: `1px solid ${active ? 'transparent' : SURFACE.border}`,
        outline: active ? '2px solid' : 'none', outlineColor: 'primary.main',
        borderRadius: 2, bgcolor: SURFACE.panel, transition: 'outline-color .15s',
      }}
    >
      <Stack
        direction="row" spacing={1.5}
        onClick={() => setOpen((o) => !o)}
        sx={{ alignItems: "center", px: 2, py: 1.25, cursor: 'pointer', userSelect: 'none' }}
      >
        <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="subtitle2">{title}</Typography>
          {summary && <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{summary}</Typography>}
        </Box>
        {badge && <Chip size="small" color="warning" variant="outlined" label={badge} />}
        <IconButton size="small" aria-label={open ? 'Collapse' : 'Expand'}>
          {open ? <ExpandLess /> : <ExpandMore />}
        </IconButton>
      </Stack>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ px: 2, pb: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>{children}</Box>
      </Collapse>
    </Box>
  );
}
