/**
 * @fileoverview Form fields for one server's connection: command, arguments
 * and environment for a local server, or URL, headers and OAuth sign-in for a
 * remote one, plus whether its tools run without asking.
 * Source: https://kiro.dev/docs/mcp/configuration/
 */
import { Alert, Box, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material';
import { setField, stringList, isObject } from '../../domain/json.js';
import { approvesAll, redirectUriError, setAutoApprove, setOAuth } from '../../domain/mcp.js';
import { ListInput } from '../../ui/ListInput';
import { KeyValueInput } from '../../ui/KeyValueInput';
import { SURFACE } from '../../theme';

/** OAuth for servers without Dynamic Client Registration (Figma, Slack, GitHub…). */
function OAuthFields({ cfg, onChange }) {
  const oauth = isObject(cfg.oauth) ? cfg.oauth : {};
  const text = (key) => (typeof oauth[key] === 'string' ? oauth[key] : '');
  const set = (key) => (e) => onChange(setOAuth(cfg, key, e.target.value));
  const uriError = redirectUriError(text('redirectUri'));
  return (
    <Box sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${SURFACE.border}` }} data-section="oauth">
      <Typography variant="overline" color="text.secondary">Sign-in (OAuth)</Typography>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1.5 }}>
        Leave these empty and Kiro registers itself with the server. Fill them in for a server that needs an app you
        registered, such as Figma, Slack or GitHub. Kiro asks you to sign in the first time; /mcp auth signs in again.
      </Typography>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1.5}>
          <TextField size="small" label="Client ID" value={text('clientId')} onChange={set('clientId')} sx={{ flex: 1 }} />
          <TextField size="small" label="Client secret" type="password" autoComplete="off" value={text('clientSecret')} onChange={set('clientSecret')} sx={{ flex: 1 }}
            disabled={!text('clientId') && !text('clientSecret')} helperText={text('clientId') ? 'Only for servers that require one (Kiro CLI only)' : 'Needs a client ID'} />
        </Stack>
        <TextField size="small" label="Redirect URI" value={text('redirectUri')} onChange={set('redirectUri')}
          placeholder="http://localhost:7778/oauth/callback" error={!!uriError}
          helperText={uriError || 'The callback you registered with the app. Empty: a random port on localhost.'} />
        <TextField size="small" label="Client metadata URL" value={text('clientMetadataUrl')} onChange={set('clientMetadataUrl')}
          placeholder="https://apps.example.com/kiro-client.json" helperText="Instead of a client ID: the HTTPS address of a hosted client metadata document." />
        <ListInput label="Scopes" value={stringList(oauth.oauthScopes)} onChange={(v) => onChange(setOAuth(cfg, 'oauthScopes', v))}
          placeholder="Type a scope and press Enter" helperText="What Kiro asks the server for, for example files:read." />
        {stringList(cfg.oauthScopes).length > 0 && (
          <Alert severity="info">
            This server also lists scopes outside the sign-in block ({stringList(cfg.oauthScopes).join(', ')}). Kiro uses
            them only when Scopes above is empty.
          </Alert>
        )}
        {text('clientSecret') && (
          <Alert severity="warning">The client secret is saved in this file as plain text. Don&apos;t commit a Workspace mcp.json that contains it.</Alert>
        )}
      </Stack>
    </Box>
  );
}

/** @param {{cfg: Object, onChange: (next: Object) => void}} props */
export function ServerFields({ cfg, onChange }) {
  const set = (key, value) => onChange(setField(cfg, key, value));
  const map = (v) => (isObject(v) ? v : {});
  const approveAll = (
    <FormControlLabel sx={{ m: 0 }} label="Run every tool without asking (autoApprove *)"
      control={<Switch size="small" checked={approvesAll(cfg)} onChange={(e) => onChange(setAutoApprove(cfg, '*', e.target.checked))} />} />
  );
  if (cfg.url !== undefined) {
    return (
      <Stack spacing={1.5}>
        <TextField size="small" label="URL" value={cfg.url} onChange={(e) => onChange({ ...cfg, url: e.target.value })} />
        <KeyValueInput label="Headers" keyLabel="Header" value={map(cfg.headers)} onChange={(v) => set('headers', v)}
          hint="Use ${VAR} to read a value from your environment." />
        <OAuthFields cfg={cfg} onChange={onChange} />
        {approveAll}
      </Stack>
    );
  }
  return (
    <Stack spacing={1.5}>
      <TextField size="small" label="Command" value={cfg.command || ''} slotProps={{ input: { sx: { fontFamily: 'monospace' } } }}
        onChange={(e) => onChange({ ...cfg, command: e.target.value })} />
      <ListInput label="Arguments" value={stringList(cfg.args)} onChange={(v) => set('args', v)} placeholder="Type an argument and press Enter" />
      <KeyValueInput label="Environment" value={map(cfg.env)} onChange={(v) => set('env', v)}
        hint="Use ${VAR} to read a value from your environment instead of storing it here." />
      {approveAll}
    </Stack>
  );
}
