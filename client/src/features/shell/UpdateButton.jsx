/**
 * @fileoverview The Update button in the header. The app updates itself
 * silently; this button is the fallback. Grey when the app is up to date (or
 * updating itself), purple when a newer version needs a manual download: it
 * then opens the download for this system. Its panel says what's happening,
 * checks now, installs a ready update now, and has the automatic updates switch.
 */
import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Divider, FormControlLabel, Link, Popover, Stack, Switch, Typography } from '@mui/material';
import { Download, Refresh, SystemUpdateAlt } from '@mui/icons-material';
import { useUpdate } from '../../data/useSystem';
import { useNotify } from '../../ui/NotifyProvider';
import { errorMessage } from '../../data/errors';
import { ACCENT } from '../../theme';

/** What the panel says for each state. */
function describe(s) {
  switch (s.state) {
    case 'uptodate': return `You're on the latest version (v${s.current}).`;
    case 'checking': return 'Checking for a new version…';
    case 'downloading': return `Downloading v${s.latest} in the background…`;
    case 'ready': return `v${s.latest} is downloaded and checked. It installs by itself when the app is idle, or now.`;
    case 'applying': return `Installing v${s.latest}. The page reconnects in a few seconds.`;
    case 'manual': return `v${s.latest} is available. ${s.reason}`;
    case 'error': return `Couldn't update: ${s.reason} It tries again later.`;
    case 'disabled': return s.reason;
    default: return `Version ${s.current}. It checks for updates by itself.`;
  }
}

export function UpdateButton() {
  const u = useUpdate();
  const notify = useNotify();
  const [anchor, setAnchor] = useState(null);
  const s = u.data;
  const announced = useRef('');
  const updatedTo = s?.updatedFrom ? s.current : '';
  useEffect(() => {
    if (updatedTo && announced.current !== updatedTo) {
      announced.current = updatedTo;
      notify(`Updated to v${updatedTo}`, 'success');
    }
  }, [updatedTo, notify]);
  if (!s) return null;
  const manual = s.state === 'manual';
  const label = manual ? `Update to v${s.latest}` : 'Update';
  const fail = (e) => notify(errorMessage(e), 'error');
  return (
    <>
      <Button size="small" variant={manual ? 'contained' : 'outlined'} startIcon={manual ? <Download /> : <SystemUpdateAlt />}
        onClick={(e) => setAnchor(e.currentTarget)} data-testid="update-button" data-state={s.state}
        sx={manual ? { bgcolor: ACCENT, '&:hover': { bgcolor: ACCENT } } : { color: 'text.disabled', borderColor: 'divider' }}>
        {label}
      </Button>
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Stack spacing={1.5} sx={{ p: 2, width: 360 }} data-testid="update-panel">
          <Typography variant="subtitle2">Config Control v{s.current}</Typography>
          <Typography variant="body2">{describe(s)}</Typography>
          {manual && (
            <Button variant="contained" startIcon={<Download />} href={s.downloadURL} target="_blank" rel="noopener noreferrer" sx={{ bgcolor: ACCENT }}>
              Download v{s.latest} for this computer
            </Button>
          )}
          {manual && (
            <Typography variant="caption" color="text.secondary">
              Unzip it and replace the app you run now. <Link href={s.releasesURL} target="_blank" rel="noopener noreferrer">All downloads and release notes</Link>
            </Typography>
          )}
          {s.state === 'ready' && <Button variant="outlined" onClick={() => u.apply.mutate(undefined, { onError: fail })} disabled={u.apply.isPending}>Install now and restart</Button>}
          {s.state === 'error' && <Alert severity="warning" variant="outlined">The page and your files are fine; only the update didn&apos;t happen.</Alert>}
          {s.state !== 'disabled' && (
            <>
              <Divider />
              <FormControlLabel control={<Switch size="small" checked={s.auto} onChange={(e) => u.setAuto.mutate(e.target.checked, { onError: fail })} />}
                label={<Typography variant="body2">Update automatically</Typography>} />
              <Typography variant="caption" color="text.secondary">
                Updates are checked against the publisher&apos;s signature before they are installed. When it&apos;s off, this button shows when a new version is out.
              </Typography>
              <Box>
                <Button size="small" startIcon={<Refresh />} disabled={u.check.isPending || ['checking', 'downloading', 'applying'].includes(s.state)}
                  onClick={() => u.check.mutate(undefined, { onError: fail })}>Check now</Button>
                {s.checked && <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>Last checked {new Date(s.checked).toLocaleString()}</Typography>}
              </Box>
            </>
          )}
        </Stack>
      </Popover>
    </>
  );
}
