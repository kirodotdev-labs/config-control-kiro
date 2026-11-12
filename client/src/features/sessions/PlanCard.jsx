/**
 * @fileoverview The plan at the top of the Usage tab: how much of this
 * month's credits are used (Kiro's own estimate, for every surface and
 * computer), the pace and forecast to the reset, and what happens past the
 * limit (overages, add-on credits, or a pause). If Kiro can't be asked, it
 * says why; the rest of the Usage tab doesn't depend on it.
 */
import { useState } from 'react';
import { Alert, AlertTitle, Box, Button, Chip, Collapse, Paper, Stack, Typography } from '@mui/material';
import { Refresh } from '@mui/icons-material';
import { usePlan, useRefreshPlan } from '../../data/useKiro';
import { errorMessage } from '../../data/errors';
import {
  PRICE_SOURCE, billingPeriod, forecast, localSince, overageAdvice, parseDay, planLabel, shortDate,
} from '../../domain/plan.js';
import { formatCredits, timeAgo } from '../../domain/sessions.js';

const COLORS = { ok: '#7B61FF', watch: '#F5A524', over: '#F5A524', reached: '#F31260' };

/** A ring: used share solid, the forecast to the reset as a faint arc. */
function Ring({ used, projected, limit, status, percent }) {
  const r = 52, c = 2 * Math.PI * r;
  const share = Math.min(1, used / limit);
  const ahead = projected == null ? 0 : Math.max(0, Math.min(1, projected / limit) - share);
  // Kiro's own percentage, to one decimal; below the limit it never shows 100%.
  const raw = percent || (used / limit) * 100;
  const pct = used >= limit ? `${Math.round(raw)}` : `${Math.min(99.9, Math.round(raw * 10) / 10)}`;
  return (
    <Box sx={{ position: 'relative', width: 128, height: 128, flexShrink: 0 }}>
      <svg width="128" height="128" viewBox="0 0 128 128" role="img" aria-label={`${pct}% of plan used`}>
        <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="12" />
        {ahead > 0 && (
          <circle cx="64" cy="64" r={r} fill="none" stroke={COLORS[status]} strokeOpacity="0.3" strokeWidth="12"
            strokeDasharray={`${ahead * c} ${c}`} strokeDashoffset={-share * c} transform="rotate(-90 64 64)" />
        )}
        <circle cx="64" cy="64" r={r} fill="none" stroke={COLORS[status]} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${share * c} ${c}`} transform="rotate(-90 64 64)" />
      </svg>
      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant={pct.length > 3 ? 'h6' : 'h5'} sx={{ fontWeight: 700, lineHeight: 1 }}>{pct}%</Typography>
        <Typography variant="caption" color="text.secondary">used</Typography>
      </Box>
    </Box>
  );
}

/** @param {{daily: {date: string, credits: number}[]}} props local chat credits per day */
export function PlanCard({ daily }) {
  const plan = usePlan();
  const refresh = useRefreshPlan();
  const [details, setDetails] = useState(false);
  const busy = plan.isLoading || refresh.isPending;
  const action = (
    <Button size="small" startIcon={<Refresh />} disabled={busy} onClick={() => refresh.mutate()}>
      {busy ? 'Asking Kiro…' : 'Refresh'}
    </Button>
  );

  if (plan.isLoading) {
    return <Alert severity="info" variant="outlined" data-testid="plan">Asking Kiro for your plan usage. This takes about 10 seconds…</Alert>;
  }
  if (plan.isError) {
    return <Alert severity="warning" action={action} data-testid="plan"><AlertTitle>Plan usage isn&apos;t available</AlertTitle>{errorMessage(plan.error)}</Alert>;
  }
  const p = plan.data;
  if (p.problem) {
    return (
      <Alert severity="warning" action={action} data-testid="plan">
        <AlertTitle>Plan usage isn&apos;t available right now</AlertTitle>
        {p.problem.message} {p.problem.fix} The figures below come from this computer and still work.
      </Alert>
    );
  }

  const fc = forecast(p);
  const reset = parseDay(p.resetsOn);
  const period = billingPeriod(p.resetsOn);
  const local = localSince(daily, period?.start);
  const advice = p.hasLimit ? overageAdvice(p, fc) : null;
  const daysLeft = fc ? Math.ceil(fc.daysLeft) : null;

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }} data-testid="plan">
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} sx={{ alignItems: { md: 'center' } }}>
        {p.hasLimit && p.limit > 0 && <Ring used={p.used} projected={fc?.projected} limit={p.limit} status={fc?.status || 'ok'} percent={p.percent} />}
        <Box sx={{ flex: '1 1 40%', minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
            <Typography variant="overline" sx={{ lineHeight: 1.5 }}>Your plan</Typography>
            {p.name && <Chip size="small" color="primary" variant="outlined" label={planLabel(p.name)} />}
            {p.managed && <Chip size="small" variant="outlined" label="Managed by your organization" />}
          </Stack>
          <Typography variant="h5" sx={{ fontVariantNumeric: 'tabular-nums', mt: 0.5 }}>
            {formatCredits(p.used)}{p.hasLimit ? ` of ${formatCredits(p.limit)}` : ''} credits
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {reset ? `Resets ${shortDate(reset)}${daysLeft != null ? `, in ${daysLeft} day${daysLeft === 1 ? '' : 's'}` : ''}. ` : ''}
            {fc?.perDay != null
              ? `About ${formatCredits(fc.perDay)} a day since ${shortDate(period.start)}; at this pace about ${formatCredits(fc.projected)} by the reset.`
              : 'A forecast appears after the first day of the month.'}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
            This is Kiro&apos;s estimate for your whole account: Kiro CLI V3 and 2.x, the IDE, Web and other computers. Of it,{' '}
            {formatCredits(local)} credits are from CLI 2.x chats on this computer, shown below.
          </Typography>
        </Box>
        {advice && (
          <Alert severity={advice.tone} sx={{ flex: '1 1 40%' }} data-testid="plan-advice" data-kind={advice.kind}>
            <AlertTitle>{advice.title}</AlertTitle>
            {advice.body}
            <Typography variant="caption" sx={{ display: 'block', mt: 0.5, opacity: 0.8 }}>
              Price as listed on {PRICE_SOURCE}{p.managed ? '; your organization\'s agreement may differ' : ''}.
            </Typography>
          </Alert>
        )}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>
          Estimated by Kiro, checked {timeAgo(p.checked)}. Your Kiro account page (app.kiro.dev/account/usage) is the authority.
        </Typography>
        <Button size="small" onClick={() => setDetails(!details)}>{details ? 'Hide details' : 'Details'}</Button>
        {action}
      </Stack>
      <Collapse in={details} unmountOnExit>
        <Box component="pre" sx={{ m: 0, mt: 1, p: 1.5, bgcolor: 'rgba(0,0,0,0.25)', borderRadius: 1, fontSize: 12, whiteSpace: 'pre-wrap' }}>{p.raw}</Box>
      </Collapse>
    </Paper>
  );
}
