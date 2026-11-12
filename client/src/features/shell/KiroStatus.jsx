/**
 * @fileoverview The connection indicator in the top bar: a green, amber or
 * red dot for the user's Kiro CLI, and a panel listing each check with what
 * to do about a failure. Refresh re-checks after installing or signing in.
 */
import { useState } from 'react';
import { Alert, Box, Button, Divider, Popover, Stack, Typography } from '@mui/material';
import { CheckCircle, Cancel, ContentCopy, Refresh, RemoveCircle } from '@mui/icons-material';
import { useKiroStatus, useRefreshKiro } from '../../data/useKiro';

const COLOR = { ok: '#3fb950', degraded: '#d29922', down: '#f85149', checking: '#8b949e' };
const LABEL = { ok: 'Connected', degraded: 'Connected, with limits', down: 'Not connected', checking: 'Checking…' };

function Check({ ok, label, value }) {
  const Icon = ok === true ? CheckCircle : ok === false ? Cancel : RemoveCircle;
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Icon sx={{ fontSize: 16, color: ok === true ? COLOR.ok : ok === false ? COLOR.down : 'text.disabled' }} />
      <Typography variant="body2" sx={{ minWidth: 110 }}>{label}</Typography>
      <Typography variant="body2" color="text.secondary" noWrap title={value}>{value}</Typography>
    </Stack>
  );
}

export function KiroStatus() {
  const { data: st, isLoading } = useKiroStatus();
  const refresh = useRefreshKiro();
  const [anchor, setAnchor] = useState(null);
  const level = isLoading || refresh.isPending ? 'checking' : st?.level || 'down';
  const p = st?.problem;

  return (
    <>
      <Box role="button" tabIndex={0} aria-label={`Kiro CLI: ${LABEL[level]}`} onClick={(e) => setAnchor(e.currentTarget)}
        onKeyDown={(e) => e.key === 'Enter' && setAnchor(e.currentTarget)}
        sx={{ display: 'flex', alignItems: 'center', gap: 0.75, cursor: 'pointer', px: 1, py: 0.5, borderRadius: 2, '&:hover': { bgcolor: 'action.hover' } }}>
        <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: COLOR[level], boxShadow: `0 0 6px ${COLOR[level]}` }} />
        <Typography variant="caption" color="text.secondary">{LABEL[level]}</Typography>
      </Box>
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Stack spacing={1.5} sx={{ p: 2, width: 380 }}>
          <Typography variant="subtitle2">Kiro CLI</Typography>
          {st && (
            <Stack spacing={0.75}>
              <Check ok={st.installed} label="Installed" value={st.installed ? `${st.version || 'unknown version'} · ${st.path}` : 'Not found'} />
              <Check ok={st.installed ? st.signedIn : undefined} label="Signed in" value={st.account?.email || st.account?.type || (st.signedIn ? 'Yes' : 'No')} />
              <Check ok={st.signedIn ? st.reachable : undefined} label="Kiro service" value={st.reachable ? 'Reachable' : st.signedIn ? 'Not reachable' : 'Not checked'} />
              <Check ok={st.installed ? st.features?.v3 : undefined} label="V3 chats" value={st.features?.v3 ? 'Supported' : 'Needs an update'} />
              {/* 2.x */}
              <Check ok={st.installed ? st.features?.agentUpgrade : undefined} label="Agent upgrade" value={st.features?.agentUpgrade ? 'Supported' : 'Needs an update'} />
              <Check ok={st.installed ? st.features?.powers : undefined} label="Powers" value={st.features?.powers ? 'Supported' : 'Needs an update'} />
              <Check ok={st.apiKey ? true : undefined} label="API key" value={st.apiKey ? 'Set (for headless runs)' : 'Not set; only needed for headless automation'} />
            </Stack>
          )}
          {p && (
            <Alert severity="error" action={p.detail && (
              <Button size="small" color="inherit" startIcon={<ContentCopy />} onClick={() => navigator.clipboard.writeText(p.detail)}>Details</Button>
            )}>
              {p.message} {p.fix}
            </Alert>
          )}
          {(st?.notes || []).map((n) => <Alert key={n} severity="warning">{n}</Alert>)}
          <Divider />
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="caption" color="text.secondary">
              {st?.checked ? `Checked ${new Date(st.checked).toLocaleTimeString()}` : ''}
            </Typography>
            <Button size="small" startIcon={<Refresh />} disabled={refresh.isPending} onClick={() => refresh.mutate()}>
              {refresh.isPending ? 'Checking…' : 'Refresh'}
            </Button>
          </Stack>
        </Stack>
      </Popover>
    </>
  );
}
