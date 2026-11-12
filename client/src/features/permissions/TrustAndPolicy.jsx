/**
 * @fileoverview Two things that change what your permission rules can do:
 * whether Kiro trusts this Workspace, and an administrator policy. Both are
 * read-only here; trust is chosen in Kiro, the policy by an administrator.
 */
import { Alert, AlertTitle, Box, Chip, Stack, Typography } from '@mui/material';

const TRUST = {
  trusted: {
    severity: 'success', title: 'Kiro trusts this Workspace',
    body: 'Kiro loads this folder\'s agents, steering, MCP servers, skills and workflows, and follows your rules for its .kiro files.',
  },
  untrusted: {
    severity: 'warning', title: 'Kiro doesn\'t trust this Workspace yet',
    body: 'Until you trust it, Kiro CLI V3 ignores this folder\'s agents, steering, MCP servers, skills and workflows, and asks before every shell command and MCP tool call, even when a rule here allows it. Start kiro-cli in the folder and choose "Trust, continue" on the first screen.',
  },
  home: {
    severity: 'info', title: 'This Workspace is your home folder',
    body: 'Kiro never saves trust for your home folder, so it asks each time you start kiro-cli there.',
  },
};

/** @param {{trust?: string, admin?: {path: string, rules: Object[], error?: string}}} props */
export function TrustAndPolicy({ trust, admin }) {
  const t = TRUST[trust];
  return (
    <>
      {t && (
        <Alert severity={t.severity} variant="outlined" data-testid="workspace-trust">
          <AlertTitle>{t.title}</AlertTitle>{t.body}
        </Alert>
      )}
      {admin && (
        <Alert severity={admin.error ? 'error' : 'info'} variant="outlined" data-testid="admin-policy">
          <AlertTitle>Your organization applies {admin.rules.length} rule{admin.rules.length === 1 ? '' : 's'} you can&apos;t change</AlertTitle>
          {admin.error || 'An administrator\'s policy is applied on top of these rules. It can only deny or ask, so it may block something a rule here allows.'}
          <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace', mt: 0.5 }}>{admin.path}</Typography>
          {admin.rules.length > 0 && (
            <Stack spacing={0.5} sx={{ mt: 1 }}>
              {admin.rules.map((r, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Chip size="small" color={r.effect === 'deny' ? 'error' : 'warning'} label={r.effect} />
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{r.capability}</Typography>
                  {r.match?.length > 0 && <Typography variant="caption" color="text.secondary">{r.match.join(', ')}</Typography>}
                  {r.exclude?.length > 0 && <Typography variant="caption" color="text.secondary">except {r.exclude.join(', ')}</Typography>}
                </Box>
              ))}
            </Stack>
          )}
        </Alert>
      )}
    </>
  );
}
