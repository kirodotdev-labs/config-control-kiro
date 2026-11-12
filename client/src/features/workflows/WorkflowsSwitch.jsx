/**
 * @fileoverview Turns workflows on and chooses how Kiro uses them, from the
 * Workflows page and the recipe editor. Saves to Global Settings (cli.json),
 * the same keys the Settings page edits: chat.enableWorkflows,
 * chat.workflowLaunch, chat.workflow.continueInterrupted.
 */
import { useState } from 'react';
import { Alert, Box, Button, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material';
import { useScopeSettings, useSetGlobalSetting } from '../../data/useSettings';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { errorMessage } from '../../data/errors';
import { useNotify } from '../../ui/NotifyProvider';
import { SURFACE } from '../../theme';

const LAUNCH = [
  { value: 'when-asked', label: 'Only when asked: Kiro starts a workflow when you ask for one (default)' },
  { value: 'large-tasks', label: 'Only for large tasks: Kiro uses workflows on its own for multi-step work' },
  { value: 'delegate-all', label: 'As much as possible: most reading, coding, testing and review go to workflows' },
];
const RESTART = 'Restart Kiro CLI (exit any open chat) for this to apply: workflow commands are fixed when it starts.';

/**
 * @param {{compact?: boolean}} props compact: one warning line when workflows are off, nothing when on.
 */
export function WorkflowsSwitch({ compact = false }) {
  const { global, workspace, ready } = useScopeSettings();
  const setting = useSetGlobalSetting();
  const { isWorkspaceMode } = useWorkspace();
  const notify = useNotify();
  // A choice shows at once, and gives way to the file's value once that's read back.
  const [chosen, setChosen] = useState({});
  const saved = (key) => global?.[key];
  const value = (key) => (key in chosen && chosen[key].was === saved(key) ? chosen[key].value : saved(key));
  const set = (key, next, done) => {
    setChosen((c) => ({ ...c, [key]: { value: next, was: saved(key) } }));
    setting.set(key, next).then(() => notify(done, 'success'), (e) => {
      setChosen((c) => { const { [key]: _drop, ...rest } = c; return rest; });
      notify(errorMessage(e), 'error');
    });
  };
  const busy = !ready || !setting.ready || setting.saving;
  const on = value('chat.enableWorkflows') === true;
  const wsOverride = isWorkspaceMode && workspace && 'chat.enableWorkflows' in workspace;

  if (compact) {
    if (!ready || on) return null;
    return (
      <Alert severity="warning" variant="outlined" data-section="workflows-off"
        action={<Button size="small" color="inherit" disabled={busy} onClick={() => set('chat.enableWorkflows', true, `Workflows on. ${RESTART}`)}>Turn on</Button>}>
        Workflows are off, so Kiro won&apos;t run this recipe. Turn them on here or in Settings.
      </Alert>
    );
  }
  return (
    <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${SURFACE.border}` }} data-section="workflows-settings">
      <Typography variant="overline" color="text.secondary">Turn it on</Typography>
      <Stack spacing={1.5} sx={{ mt: 0.5 }}>
        <FormControlLabel sx={{ m: 0 }} disabled={busy}
          control={<Switch checked={on} onChange={(e) => set('chat.enableWorkflows', e.target.checked ? true : undefined, `${e.target.checked ? 'Workflows on' : 'Workflows off'}. ${RESTART}`)} />}
          label={<span>Workflows <Box component="span" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>(chat.enableWorkflows)</Box></span>} />
        <TextField select size="small" label="When Kiro uses them (chat.workflowLaunch)" value={value('chat.workflowLaunch') || 'when-asked'} disabled={busy || !on} sx={{ maxWidth: 640 }}
          onChange={(e) => set('chat.workflowLaunch', e.target.value === 'when-asked' ? undefined : e.target.value, 'Saved. It applies to new chats.')}>
          {LAUNCH.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
        </TextField>
        <FormControlLabel sx={{ m: 0 }} disabled={busy || !on}
          control={<Switch size="small" checked={value('chat.workflow.continueInterrupted') === true}
            onChange={(e) => set('chat.workflow.continueInterrupted', e.target.checked ? true : undefined, 'Saved.')} />}
          label={<span>Continue interrupted runs after reconnecting <Box component="span" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>(chat.workflow.continueInterrupted)</Box></span>} />
        <Typography variant="caption" color="text.secondary">
          Saved in Global Settings, where you can also change them. {RESTART}
          {wsOverride ? ` This Workspace's own settings also set chat.enableWorkflows to ${String(workspace['chat.enableWorkflows'])}.` : ''}
        </Typography>
      </Stack>
    </Box>
  );
}
