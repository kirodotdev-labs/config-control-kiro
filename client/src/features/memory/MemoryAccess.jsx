/**
 * @fileoverview How Kiro may use memory, set right here: access (read &
 * write, read only, off) and automatic updates. Both are Global settings
 * (memory.mode, memory.reflection in cli.json) that new V3 chats read; a
 * Workspace can't change them. In a Workspace Kiro doesn't trust, Kiro can
 * read memories but not change them.
 * Source: https://kiro.dev/docs/memory/
 */
import { useState } from 'react';
import { Alert, Box, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material';
import { usePermissions, useScopeSettings, useSetGlobalSetting } from '../../data/useSettings';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { errorMessage } from '../../data/errors';
import { useNotify } from '../../ui/NotifyProvider';
import { SURFACE } from '../../theme';

const MODES = [
  { value: '', label: "Kiro's default" },
  { value: 'read_write', label: 'Read & write: Kiro uses and changes memories' },
  { value: 'read_only', label: 'Read only: Kiro uses them, never changes them' },
  { value: 'disabled', label: 'Off: Kiro neither uses nor changes them' },
];

export function MemoryAccess() {
  const { global, ready } = useScopeSettings();
  const setting = useSetGlobalSetting();
  const { isWorkspaceMode } = useWorkspace();
  const { data: perms } = usePermissions();
  const notify = useNotify();
  // A choice shows at once; it gives way to the file's value once that's read back.
  const [chosen, setChosen] = useState({});
  const saved = (key) => global?.[key];
  const value = (key) => (key in chosen && chosen[key].was === saved(key) ? chosen[key].value : saved(key));
  const mode = typeof value('memory.mode') === 'string' ? value('memory.mode') : '';
  const reflection = value('memory.reflection');
  const set = (key, next, done) => {
    setChosen((c) => ({ ...c, [key]: { value: next, was: saved(key) } }));
    setting.set(key, next).then(() => notify(done, 'success'), (e) => {
      setChosen((c) => { const { [key]: _drop, ...rest } = c; return rest; });
      notify(errorMessage(e), 'error');
    });
  };
  const busy = !ready || !setting.ready || setting.saving;
  return (
    <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${SURFACE.border}` }} data-section="memory-access">
      <Typography variant="overline" color="text.secondary">How Kiro may use memory</Typography>
      <Stack spacing={1.5} sx={{ mt: 1 }}>
        <TextField select size="small" label="Access (memory.mode)" value={mode} disabled={busy} sx={{ maxWidth: 460 }}
          onChange={(e) => set('memory.mode', e.target.value || undefined, 'Memory access saved. New V3 chats use it.')}>
          {MODES.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
          {mode && !MODES.some((m) => m.value === mode) && <MenuItem value={mode}>{mode}</MenuItem>}
        </TextField>
        <FormControlLabel sx={{ m: 0 }} disabled={busy || mode === 'read_only' || mode === 'disabled'}
          control={<Switch size="small" checked={reflection === true} onChange={(e) => set('memory.reflection', e.target.checked ? true : undefined, 'Automatic updates saved.')} />}
          label="Automatic updates: Kiro creates and refines memories on its own, also after a chat ends (memory.reflection)" />
        <Typography variant="caption" color="text.secondary">
          Saved in Global Settings, so they apply everywhere{isWorkspaceMode ? ', this Workspace included' : ''}. Access applies to new chats;
          automatic updates apply at once and need read & write. In a chat, /memories → config changes the same settings.
        </Typography>
        {isWorkspaceMode && perms?.trust && perms.trust !== 'trusted' && (
          <Alert severity="info">Kiro doesn&apos;t trust this Workspace yet, so in chats here it can read memories but not add, change or delete them.</Alert>
        )}
      </Stack>
    </Box>
  );
}
