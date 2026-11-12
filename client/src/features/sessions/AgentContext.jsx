/**
 * @fileoverview What an agent sends with every prompt, before you type: a bar
 * of the context window split by kind, every item biggest first with its
 * exact count, what is connected but not sent and why, and suggestions that
 * would send less.
 */
import { Alert, Box, Chip, CircularProgress, LinearProgress, Stack, Tooltip, Typography } from '@mui/material';
import { ACCENT, ACCENT_ALT, SURFACE } from '../../theme';
import { contextSuggestions } from '../../domain/context.js';

const KIND_COLOR = { mcp: ACCENT, steering: '#4FC3F7', agentsmd: '#81C784', prompt: ACCENT_ALT, files: '#FFB74D' };
const fmt = (n) => n.toLocaleString('en-US');

/** The context window as a bar, one segment per kind. */
function WindowBar({ ctx, window }) {
  const scale = window || ctx.total || 1;
  return (
    <Box data-testid="context-bar" sx={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', bgcolor: SURFACE.raised }}>
      {ctx.kinds.map((k) => (
        <Tooltip key={k.id} title={`${k.label}: ${fmt(k.tokens)} tokens`}>
          <Box sx={{ width: `${Math.max(0.5, (k.tokens / scale) * 100)}%`, bgcolor: KIND_COLOR[k.id] }} />
        </Tooltip>
      ))}
    </Box>
  );
}

function ItemRow({ item, largest }) {
  const title = item.ring
    ? (item.problem ? (item.problem.startsWith('Not measured') ? item.problem : `Couldn't list its tools, so its size isn't known: ${item.problem}`) : 'Measuring: listing its tools now.')
    : item.kind === 'mcp'
      ? `${fmt(item.tokens)} tokens with every message: the definitions of ${item.tools} of its ${item.toolsTotal} tools. In V3 chats, Tool Search can send fewer.`
      : `${fmt(item.tokens)} tokens with every message.`;
  return (
    <Tooltip title={title} placement="left">
      <Stack direction="row" spacing={1.5} data-context-item={item.name} sx={{ alignItems: 'center', py: 0.5 }}>
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, boxSizing: 'border-box',
          bgcolor: item.ring ? 'transparent' : KIND_COLOR[item.kind], border: item.ring ? `1.5px solid ${KIND_COLOR[item.kind]}` : 'none' }} />
        <Box sx={{ width: 200, minWidth: 0, flexShrink: 0 }}>
          <Typography variant="body2" noWrap title={item.name}>{item.name}</Typography>
          {item.source && <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{item.source}</Typography>}
        </Box>
        <LinearProgress variant={item.ring && !item.problem ? 'indeterminate' : 'determinate'} value={largest ? (item.tokens / largest) * 100 : 0}
          sx={{ flexGrow: 1, height: 6, borderRadius: 3, bgcolor: SURFACE.raised, '& .MuiLinearProgress-bar': { bgcolor: KIND_COLOR[item.kind] } }} />
        <Typography variant="body2" sx={{ width: 110, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {item.ring ? (item.problem ? 'not measured' : 'measuring…') : `${fmt(item.tokens)} tokens`}
        </Typography>
      </Stack>
    </Tooltip>
  );
}

/**
 * @param {Object} props
 * @param {ReturnType<import('./useAgentContext').useAgentContext>} props.context
 */
export function AgentContext({ context }) {
  const { ctx, window, modelName, measuring } = context;
  if (!ctx) return <Typography variant="body2" color="text.secondary">Reading what this agent loads…</Typography>;
  if (!ctx.items.length) {
    return <Typography variant="body2" color="text.secondary">This agent sends no files or MCP tools of its own with each prompt.</Typography>;
  }
  const pct = window ? (ctx.total / window) * 100 : 0;
  const largest = ctx.items[0]?.tokens || 0;
  const suggestions = contextSuggestions(ctx, window);
  return (
    <Stack spacing={1.5}>
      <Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', mb: 0.75 }}>
          <Typography variant="subtitle2" data-testid="context-total">
            {fmt(ctx.total)} tokens with every prompt, before you type
          </Typography>
          {window > 0 && (
            <Typography variant="caption" color="text.secondary">
              {pct < 1 ? 'under 1' : Math.round(pct)}% of the {fmt(window)}-token window of {modelName}
            </Typography>
          )}
          {measuring && <CircularProgress size={12} sx={{ ml: 0.5 }} aria-label="Measuring MCP servers" />}
        </Stack>
        <WindowBar ctx={ctx} window={window} />
        <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1, flexWrap: 'wrap' }}>
          {ctx.kinds.map((k) => (
            <Chip key={k.id} size="small" variant="outlined" data-kind={k.id}
              icon={<Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: KIND_COLOR[k.id], ml: '8px !important' }} />}
              label={`${k.label}: ${fmt(k.tokens)}${k.count > 1 ? ` (${k.count})` : ''}`} />
          ))}
        </Stack>
      </Box>
      <Box>{ctx.items.map((i) => <ItemRow key={i.key} item={i} largest={largest} />)}</Box>
      {suggestions.map((s) => <Alert key={s.id} severity="info" variant="outlined" data-suggestion={s.id}>{s.text}</Alert>)}
      {ctx.notSent.length > 0 && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Connected, but not counted above</Typography>
          {ctx.notSent.map((n) => (
            <Typography key={n.name} variant="body2" color="text.secondary" data-not-sent={n.name}>
              <b>{n.name}</b>: {n.reason}
            </Typography>
          ))}
        </Box>
      )}
      <Typography variant="caption" color="text.secondary">
        Kiro also sends its own system prompt, its built-in tools and the conversation so far; those aren&apos;t counted here.
      </Typography>
    </Stack>
  );
}
