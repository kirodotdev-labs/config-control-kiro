/**
 * @fileoverview The app frame: brand, Kiro CLI status, the app's version and
 * its Update button.
 */
import { Box, Stack, Typography } from '@mui/material';
import { useUpdate } from '../../data/useSystem';
import { ACCENT, SURFACE } from '../../theme';
import { KiroStatus } from './KiroStatus';
import { UpdateButton } from './UpdateButton';


/**
 * @param {{children: React.ReactNode}} props
 */
export function AppShell({ children }) {
  const { data: version } = useUpdate();
  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: SURFACE.base }}>
      <Box component="header" sx={{
        px: 3, py: 1.25, display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
        borderBottom: `1px solid ${SURFACE.border}`, background: `linear-gradient(180deg, ${SURFACE.panel} 0%, ${SURFACE.base} 100%)`,
      }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", userSelect: 'none' }}>
          <Typography sx={{ fontWeight: 300, fontSize: '0.85rem', color: 'text.secondary' }}>Config Control</Typography>
          <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: 3, color: ACCENT }}>KIRO</Typography>
        </Stack>
        <Box sx={{ flexGrow: 1 }} />
        <KiroStatus />
        {version?.current && version.current !== 'dev' && <Typography variant="caption" color="text.secondary">v{version.current}</Typography>}
        <UpdateButton />
      </Box>
      <Box sx={{ flexGrow: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>{children}</Box>
    </Box>
  );
}
