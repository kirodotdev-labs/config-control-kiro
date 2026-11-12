/**
 * @fileoverview The Usage tab: credits today, this week and this month, a
 * 30-day chart, and where the credits went (agents, models, folders, the
 * most expensive chats), with suggestions that point back to configuration.
 */
import { Alert, Box, Button, LinearProgress, Paper, Stack, Tooltip, Typography } from '@mui/material';
import { PlayArrow } from '@mui/icons-material';
import { agentAdvice, agentLabel, barHeights, folderLabel, formatCredits } from '../../domain/sessions.js';
import { SURFACE } from '../../theme';
import { useResume } from './useResume';
import { PlanCard } from './PlanCard';

function Tile({ label, value, sub }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, flex: '1 1 140px', borderRadius: 2 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h5" sx={{ fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
      {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
    </Paper>
  );
}

function Daily({ daily }) {
  const heights = barHeights(daily);
  return (
    <Box>
      <Typography variant="overline">Credits per day, last 30 days</Typography>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'flex-end',  height: 110, mt: 1 }} aria-label="Credits per day">
        {daily.map((d, i) => (
          <Tooltip key={d.date} title={`${d.date}: ${formatCredits(d.credits)} credits`}>
            <Box sx={{ flex: 1, height: `${Math.max(heights[i], d.credits ? 3 : 1)}%`, borderRadius: '3px 3px 0 0',
              bgcolor: i === daily.length - 1 ? 'primary.light' : d.credits ? 'primary.dark' : SURFACE.border }} />
          </Tooltip>
        ))}
      </Stack>
      <Stack sx={{ justifyContent: 'space-between' }} direction="row">
        <Typography variant="caption" color="text.secondary">{daily[0]?.date}</Typography>
        <Typography variant="caption" color="text.secondary">today</Typography>
      </Stack>
    </Box>
  );
}

function Bars({ title, rows, total, label }) {
  if (!rows.length) return null;
  return (
    <Box>
      <Typography variant="overline">{title}</Typography>
      <Stack spacing={1} sx={{ mt: 0.5 }}>
        {rows.slice(0, 8).map((r) => (
          <Box key={r.name}>
            <Stack sx={{ justifyContent: 'space-between' }} direction="row" spacing={1}>
              <Typography variant="body2" noWrap title={r.name}>{label(r)}</Typography>
              <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                {formatCredits(r.credits)} cr · {r.chats} chat{r.chats === 1 ? '' : 's'}
              </Typography>
            </Stack>
            <LinearProgress variant="determinate" value={total ? (r.credits / total) * 100 : 0} sx={{ height: 5, borderRadius: 2 }} />
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

function AgentRow({ a, onOpenAgent, agentIds }) {
  const advice = agentAdvice(a);
  const canOpen = agentIds.has(a.name) && onOpenAgent;
  return (
    <Box sx={{ py: 1.25, borderBottom: `1px solid ${SURFACE.border}` }}>
      <Stack sx={{ alignItems: 'baseline' }} direction="row" spacing={2}>
        <Typography variant="subtitle2" sx={{ flex: '1 1 30%', minWidth: 0 }} noWrap>
          {canOpen
            ? <Box component="button" onClick={() => onOpenAgent(a.name)} sx={{ border: 0, p: 0, background: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer', textDecoration: 'underline dotted' }}>{agentLabel(a.name)}</Box>
            : agentLabel(a.name)}
          {a.runningNow > 0 && <Typography component="span" variant="caption" color="success.main"> · {a.runningNow} running</Typography>}
        </Typography>
        <Typography variant="body2" sx={{ width: 90, textAlign: 'right' }}>{formatCredits(a.credits)} cr</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ width: 70, textAlign: 'right' }}>{a.chats} chat{a.chats === 1 ? '' : 's'}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ width: 120, textAlign: 'right' }}>{a.avgContextPct.toFixed(0)}% avg context</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ flex: '1 1 25%', minWidth: 0 }} noWrap title={a.models.join(', ')}>
          {a.mainModel}{a.mainRate > 1 ? ` (${a.mainRate}x)` : ''}
        </Typography>
      </Stack>
      {advice.map((x) => <Typography key={x.id} variant="caption" color="warning.light" sx={{ display: 'block', mt: 0.5 }}>{x.text}</Typography>)}
    </Box>
  );
}

/**
 * @param {Object} props
 * @param {Object} props.usage
 * @param {Object[]} props.sessions
 * @param {{name: string, path: string}[]} props.workspaces
 * @param {boolean} props.global
 * @param {Set<string>} props.agentIds
 * @param {(id: string) => void} [props.onOpenAgent]
 */
export function UsageView({ usage, sessions, workspaces, global, agentIds, onOpenAgent }) {
  const resumer = useResume();
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const running = sessions.filter((s) => s.running).length;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <PlanCard daily={usage.daily} />
      <Typography variant="overline" sx={{ mb: -1.5 }}>On this computer</Typography>
      <Stack sx={{ flexWrap: 'wrap' }} direction="row" spacing={1.5} useFlexGap>
        <Tile label="Today" value={formatCredits(usage.today)} sub="credits" />
        <Tile label="Last 7 days" value={formatCredits(usage.week)} sub="credits" />
        <Tile label="Last 30 days" value={formatCredits(usage.month)} sub="credits" />
        <Tile label="Running now" value={running} sub={running === 1 ? 'chat' : 'chats'} />
      </Stack>
      {usage.covered < usage.total && (
        <Alert severity="info">
          Credits are known for {usage.covered} of {usage.total} chats: every V3 chat and every 2.x chat Kiro saved with its metering.
          Kiro doesn&apos;t save credits for classic (legacy UI) chats where this app can read them, so those count as unknown, not zero.
          Your Kiro account page has the authoritative total.
        </Alert>
      )}
      <Daily daily={usage.daily} />
      <Box>
        <Typography variant="overline">By agent, last 30 days</Typography>
        {usage.byAgent.length ? usage.byAgent.map((a) => <AgentRow key={a.name} a={a} onOpenAgent={onOpenAgent} agentIds={agentIds} />)
          : <Typography variant="body2" color="text.secondary">No credits recorded in the last 30 days.</Typography>}
      </Box>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Bars title="By model" rows={usage.byModel} total={usage.month} label={(r) => `${r.name}${r.rateMultiplier > 1 ? ` (${r.rateMultiplier}x)` : ''}`} />
        </Box>
        {global && (
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Bars title="By folder" rows={usage.byFolder} total={usage.month} label={(r) => folderLabel(r.name, workspaces).label} />
          </Box>
        )}
      </Stack>
      {usage.top.length > 0 && (
        <Box>
          <Typography variant="overline">Chats that used the most, last 30 days</Typography>
          {usage.top.map((t) => {
            const chat = byId.get(t.id);
            return (
              <Stack key={t.id} direction="row" spacing={1.5} sx={{ alignItems: 'center',  py: 0.75, borderBottom: `1px solid ${SURFACE.border}` }}>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="body2" noWrap title={t.title}>{t.title || 'Untitled chat'}</Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>{folderLabel(t.folder, workspaces).label} · {agentLabel(t.agent)}</Typography>
                </Box>
                <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatCredits(t.credits)} cr</Typography>
                <Button size="small" startIcon={<PlayArrow />} disabled={!chat?.resumeCommand || chat?.running || resumer.pending}
                  onClick={() => resumer.resume(chat)}>Resume</Button>
              </Stack>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
