/**
 * @fileoverview The scannable list view of agents.
 */
import { Box, Chip, Stack, Typography } from '@mui/material';
import { m } from 'motion/react';
import { ACCENT, SURFACE } from '../../theme';

/** @param {{agents: Object[], onOpen: (id: string) => void}} props */
export function AgentList({ agents, onOpen }) {
  return (
    <Stack spacing={1} sx={{ height: '100%', overflow: 'auto', pr: 1 }}>
      {agents.map((a, i) => (
        <m.div key={a.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.02, 0.2) }}>
          <Box
            role="button" tabIndex={0} onClick={() => onOpen(a.id)} onKeyDown={(e) => e.key === 'Enter' && onOpen(a.id)}
            sx={{
              p: 2, borderRadius: 2, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2,
              border: `1px solid ${SURFACE.border}`, bgcolor: SURFACE.panel, transition: 'all .15s',
              '&:hover, &:focus-visible': { borderColor: ACCENT, bgcolor: SURFACE.raised, outline: 'none' },
            }}
          >
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: ACCENT, flexShrink: 0 }} />
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 600 }} noWrap>{a.name || a.id}</Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {a.description || `${a.id}.${a.format}`}
              </Typography>
            </Box>
            {/* 2.x: remove with V2 support */}
            {a.v3?.kiro === 'out-of-sync' && <Chip size="small" color="warning" variant="outlined" label="out of sync" />}
            {a.v3?.kiro !== 'out-of-sync' && a.v3?.state === 'blocked' && <Chip size="small" color="warning" variant="outlined" label="CLI 2.x agent" />}
            {a.v3?.kiro !== 'out-of-sync' && a.v3?.state === 'upgrade' && <Chip size="small" color="warning" variant="outlined" label="needs upgrade" />}
            {a.v3?.universal && a.v3.state === 'v3' && a.v3.kiro !== 'out-of-sync' && <Chip size="small" variant="outlined" label="upgraded by Kiro" />}
            {a.overridesGlobal && <Chip size="small" variant="outlined" label="overrides Global" />}
            {a.format === 'md' && <Chip size="small" variant="outlined" label="md" />}
            <Typography variant="caption" color="text.secondary">{a.model || 'default model'}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 56, textAlign: 'right' }}>
              {a.toolCount} tool{a.toolCount === 1 ? '' : 's'}
            </Typography>
          </Box>
        </m.div>
      ))}
    </Stack>
  );
}
