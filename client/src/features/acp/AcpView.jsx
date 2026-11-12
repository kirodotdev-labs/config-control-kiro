/**
 * @fileoverview ACP: what it is, the ways to use it, and a sample
 * configuration for each that you can edit and copy. Nothing is written
 * anywhere; you paste the sample where you want to use Kiro.
 */
import { useMemo, useState } from 'react';
import { Alert, Box, Button, Link, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { Cable, ContentCopy } from '@mui/icons-material';
import { useKiroStatus } from '../../data/useKiro';
import { useSystemInfo } from '../../data/useSystem';
import { acpOptions } from '../../domain/acp.js';
import { CodeEditor } from '../../ui/CodeEditor';
import { useNotify } from '../../ui/NotifyProvider';
import { SURFACE } from '../../theme';

/** @param {{onOpenSettings: () => void}} props */
export function AcpView({ onOpenSettings }) {
  const { data: status } = useKiroStatus();
  const { data: info } = useSystemInfo();
  const options = useMemo(() => acpOptions({ path: status?.path, isWSL: info?.isWSL, platform: info?.platform }), [status?.path, info?.isWSL, info?.platform]);
  const [choice, setChoice] = useState('jetbrains');
  const option = options.find((o) => o.id === choice);
  // Every sample, field and message is editable; edits are kept per item until the page is left.
  const [edits, setEdits] = useState({});
  const notify = useNotify();
  const value = (key, original) => edits[key] ?? original;
  const set = (key) => (v) => setEdits((e) => ({ ...e, [key]: v }));
  const reset = (key) => setEdits(({ [key]: _gone, ...rest }) => rest);
  const copy = async (text) => { await navigator.clipboard.writeText(text); notify('Copied', 'success'); };
  /** An editable box with Copy (and Reset after an edit). */
  const box = (key, original, height, language = 'json') => (
    <Box data-section="acp-sample" data-sample={key}>
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', mb: 0.5 }}>
        {edits[key] !== undefined && <Button size="small" color="inherit" onClick={() => reset(key)}>Reset</Button>}
        <Button size="small" variant="contained" startIcon={<ContentCopy />} onClick={() => copy(value(key, original))}>Copy</Button>
      </Stack>
      <Box sx={{ height, border: `1px solid ${SURFACE.border}`, borderRadius: 1, overflow: 'hidden' }}>
        <CodeEditor key={key} value={value(key, original)} onChange={set(key)} language={language} />
      </Box>
    </Box>
  );
  const lines = (text) => text.split('\n').length * 20 + 16;

  return (
    <Box sx={{ height: '100%', overflow: 'auto', p: 3 }}>
      <Stack spacing={2} sx={{ maxWidth: 900 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Cable color="primary" />
          <Typography variant="h6">ACP</Typography>
        </Stack>
        <Typography variant="body2">
          ACP (Agent Client Protocol) lets another program use Kiro as its agent. The program starts <code>kiro-cli acp</code> and talks to it;
          Kiro works with your usual agents, steering, skills, hooks, permissions and MCP servers, and the project the program opens decides
          which Workspace settings apply. ACP connects a program <em>to</em> Kiro; MCP connects Kiro to tools.
          {' '}<Link href="https://kiro.dev/docs/acp/" target="_blank" rel="noreferrer">Kiro docs</Link>
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Use it from an <strong>IDE</strong> that supports ACP (JetBrains, Zed), a <strong>plugin</strong> in an editor that doesn&apos;t (VS Code), or <strong>your own program</strong>.
          Each client shows Kiro in its own way, so not every feature looks the same everywhere.
        </Typography>
        {status && !status.signedIn && <Alert severity="warning" variant="outlined">You&apos;re signed out. ACP needs a signed-in Kiro account: run <code>kiro-cli login</code> first.</Alert>}
        {status?.signedIn && <Typography variant="caption" color="text.secondary">Signed in{status.account?.email ? ` as ${status.account.email}` : ''}. The samples use your kiro-cli at <code>{status.path}</code>.</Typography>}
        {info?.isWSL && <Alert severity="info" variant="outlined">This app runs in WSL, so the samples start Kiro through <code>wsl.exe</code> for an editor on Windows. If Kiro CLI is installed on Windows too, you can use its <code>kiro-cli.exe</code> path instead.</Alert>}

        <Typography variant="overline" color="text.secondary">Choose an option</Typography>
        <ToggleButtonGroup exclusive size="small" value={choice} onChange={(_, v) => v && setChoice(v)} sx={{ flexWrap: 'wrap' }}>
          {options.map((o) => <ToggleButton key={o.id} value={o.id} sx={{ textTransform: 'none' }}>{o.label}</ToggleButton>)}
        </ToggleButtonGroup>
        <Box component="ol" sx={{ m: 0, pl: 3 }} data-section="acp-steps">
          {option.steps.map((s) => <Typography key={s} component="li" variant="body2">{s}</Typography>)}
        </Box>

        {option.sample && (
          <>
            <Typography variant="body2" color="text.secondary">Sample for <code>{option.where}</code>. Edit it if you need to, then copy it.</Typography>
            {box(option.id, option.sample, lines(option.sample))}
          </>
        )}
        {option.fields && option.fields.map((f) => (
          <Stack key={f.id} direction="row" spacing={1} sx={{ alignItems: 'center' }} data-field={f.id}>
            <TextField size="small" label={f.label} value={value(`${option.id}.${f.id}`, f.value)} onChange={(e) => set(`${option.id}.${f.id}`)(e.target.value)} fullWidth
              slotProps={{ input: { sx: { fontFamily: 'monospace' } } }} />
            <Button size="small" variant="contained" startIcon={<ContentCopy />} onClick={() => copy(value(`${option.id}.${f.id}`, f.value))} sx={{ flexShrink: 0 }}>Copy</Button>
          </Stack>
        ))}
        {option.messages && (
          <>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }} data-field="start">
              <TextField size="small" label="Command your program starts" value={value('program.start', option.start)} onChange={(e) => set('program.start')(e.target.value)} fullWidth
                slotProps={{ input: { sx: { fontFamily: 'monospace' } } }} />
              <Button size="small" variant="contained" startIcon={<ContentCopy />} onClick={() => copy(value('program.start', option.start))} sx={{ flexShrink: 0 }}>Copy</Button>
            </Stack>
            {option.messages.map((m) => (
              <Box key={m.id} data-message={m.id}>
                <Typography variant="subtitle2">{m.title}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>{m.note}</Typography>
                {box(`program.${m.id}`, m.sample, lines(m.sample))}
              </Box>
            ))}
          </>
        )}

        <Typography variant="body2" color="text.secondary">
          Which engine ACP sessions use (V3 or V2) is the <code>acp.agentEngine</code> setting; left unset, Kiro CLI 3.0 and later use V3.
          {' '}<Link component="button" variant="body2" onClick={onOpenSettings}>Open Settings</Link>.
          Adding <code>--agent</code>, <code>--model</code> or <code>--trust-all-tools</code> to the arguments keeps the session on V2.
          Logs go to <code>kiro-chat.log</code> in Kiro&apos;s log folder; start with <code>KIRO_LOG_LEVEL=debug</code> for more detail.
        </Typography>
      </Stack>
    </Box>
  );
}
