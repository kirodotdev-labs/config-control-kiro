/**
 * @fileoverview The agents that ship with Kiro CLI, read-only. They can't be
 * edited, but you can start a chat with one or make it the default.
 * Source: `kiro-cli agent list` (kiro.dev/docs/custom-agents/built-in).
 */
import { Box, Chip, Collapse, Stack, Typography } from '@mui/material';
import { ExpandLess, ExpandMore, Lock } from '@mui/icons-material';
import { useBuiltinAgents, useKiroStatus } from '../../data/useKiro';
import usePersistedState from '../../hooks/usePersistedState';
import { SURFACE } from '../../theme';

export function BuiltinAgents() {
  const { data: status } = useKiroStatus();
  const { data } = useBuiltinAgents(!!status?.installed);
  const [open, setOpen] = usePersistedState('builtin-agents-open', false);
  if (!data?.agents?.length) return null;
  const custom = data.default && !data.agents.some((a) => a.name === data.default);
  return (
    <Box sx={{ border: `1px solid ${SURFACE.border}`, borderRadius: 2 }} data-testid="builtin-agents">
      <Stack direction="row" spacing={1} onClick={() => setOpen(!open)}
        sx={{ alignItems: 'center', px: 2, py: 1, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}>
        <Lock sx={{ fontSize: 18, color: 'text.secondary' }} />
        <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
          Built into Kiro CLI ({data.agents.length})
          <Typography component="span" variant="caption" color="text.secondary">
            {' '}· {custom ? `new chats start with your agent ${data.default}` : 'new chats start with the default agent'}
          </Typography>
        </Typography>
        {open ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
      </Stack>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ px: 2, pb: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            These come with Kiro and can&apos;t be edited. Pick one in a chat with /agent, or make one the default in Settings → chat.defaultAgent.
          </Typography>
          {data.agents.map((a) => (
            <Stack key={a.name} direction="row" spacing={1.5} sx={{ alignItems: 'baseline', py: 0.5 }}>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', minWidth: 140 }}>{a.name}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>{a.description}</Typography>
              {a.default && <Chip size="small" color="primary" variant="outlined" label="default" />}
            </Stack>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}
