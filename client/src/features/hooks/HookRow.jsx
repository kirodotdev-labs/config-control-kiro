/**
 * @fileoverview Edits one V3 hook definition, including the confirmation a
 * Stop command hook can ask. Fields this form does not know (e.g.
 * description) are kept as they are.
 */
import { useEffect, useRef } from 'react';
import {
  Autocomplete, Box, FormControlLabel, IconButton, MenuItem, Stack, Switch, TextField,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import { Delete } from '@mui/icons-material';
import { TRIGGERS, canConfirm, triggerInfo, hookError, withTrigger } from '../../domain/hooks.js';
import { useKiroStatus } from '../../data/useKiro';
import { versionAtLeast } from '../../domain/version.js';
import { ConfirmEditor } from './ConfirmEditor';
import { isObject, setField } from '../../domain/json.js';
import { SURFACE } from '../../theme';

/**
 * @param {Object} props
 * @param {Object} props.hook
 * @param {(next: Object) => void} props.onChange
 * @param {() => void} props.onRemove
 * @param {string[]} props.toolMatchers
 * @param {() => void} [props.onFocus] this hook was clicked: highlight it in the JSON.
 * @param {boolean} [props.active] highlighted (the JSON cursor is on it).
 * @param {number} [props.reveal] bump to scroll this hook into view. suggestions for tool-use matchers.
 */
export function HookRow({ hook, onChange, onRemove, toolMatchers, onFocus, active = false, reveal = 0 }) {
  const ref = useRef(null);
  useEffect(() => { // the JSON cursor is on this hook
    if (reveal) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [reveal]);
  const trigger = triggerInfo(hook.trigger);
  const { data: status } = useKiroStatus();
  const tooOld = trigger?.since && !versionAtLeast(status?.version, trigger.since);
  const action = isObject(hook.action) ? hook.action : { type: 'command' };
  const isAgent = action.type === 'agent';
  const error = hookError(hook);
  const set = (key, value) => onChange(setField(hook, key, value));
  const setAction = (next) => onChange({ ...hook, action: next });

  return (
    <Box ref={ref} onClickCapture={onFocus} onFocusCapture={onFocus}
      sx={{ p: 1.5, border: `1px solid ${error ? 'rgba(244,67,54,.5)' : active ? 'transparent' : SURFACE.border}`, outline: active ? '2px solid' : 'none', outlineColor: 'primary.main', borderRadius: 2 }}>
      <Stack sx={{ alignItems: "flex-start" }} direction="row" spacing={1}>
        <TextField size="small" label="Name" value={hook.name || ''} sx={{ flex: 1 }}
          onChange={(e) => onChange({ ...hook, name: e.target.value })} />
        <TextField select size="small" label="When" value={trigger?.value || hook.trigger || ''} sx={{ flex: 1.3 }}
          onChange={(e) => onChange(withTrigger(hook, e.target.value))}>
          {TRIGGERS.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
        </TextField>
        <FormControlLabel label="On" sx={{ m: 0 }} control={
          <Switch size="small" checked={hook.enabled !== false} onChange={(e) => set('enabled', e.target.checked ? undefined : false)} />
        } />
        <Tooltip title="Remove hook"><IconButton onClick={onRemove}><Delete fontSize="small" /></IconButton></Tooltip>
      </Stack>

      {trigger?.matcher && (
        <Autocomplete
          freeSolo size="small" options={trigger.matcher === 'tool' ? toolMatchers : []}
          value={hook.matcher || ''} onInputChange={(_, v) => set('matcher', v)}
          renderInput={(params) => (
            <TextField {...params} label={trigger.matcher === 'tool' ? 'Which tools' : 'Which files (regex)'} sx={{ mt: 1.5 }}
              helperText={trigger.matcher === 'tool'
                ? 'A tag (read, write, shell, web), a tool ID, @mcp, @server or a regex. Empty matches every tool.'
                : 'Matched against the file path, e.g. \\.(ts|tsx)$. Empty matches every file.'} />
          )}
        />
      )}

      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 1.5 }}>
        <ToggleButtonGroup size="small" exclusive value={isAgent ? 'agent' : 'command'}
          onChange={(_, v) => v && setAction(v === 'agent' ? { type: 'agent', prompt: action.prompt || '' } : { type: 'command', command: action.command || '' })}>
          <ToggleButton value="command">Run command</ToggleButton>
          <ToggleButton value="agent">Ask the agent</ToggleButton>
        </ToggleButtonGroup>
        {!isAgent && (
          <TextField size="small" type="number" label="Timeout (s)" value={hook.timeout ?? ''} sx={{ width: 120 }}
            onChange={(e) => set('timeout', e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)))}
            slotProps={{ htmlInput: { min: 0 } }} />
        )}
      </Stack>
      <TextField
        fullWidth size="small" multiline minRows={isAgent ? 2 : 1} sx={{ mt: 1.5 }}
        label={isAgent ? 'Prompt sent to the agent' : 'Shell command'}
        value={(isAgent ? action.prompt : action.command) || ''}
        onChange={(e) => setAction({ ...action, [isAgent ? 'prompt' : 'command']: e.target.value })}
        slotProps={{ input: { sx: { fontFamily: isAgent ? undefined : 'monospace' } } }}
      />
      {canConfirm(hook) && <ConfirmEditor hook={hook} onChange={onChange} />}
      {hook.confirm !== undefined && !canConfirm(hook) && (
        <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 1 }}>
          This hook has a confirmation, which Kiro only uses on a Stop hook that runs a command. It&apos;s kept as it is.
        </Typography>
      )}
      {tooOld && (
        <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 1 }}>
          This trigger needs Kiro CLI {trigger.since} or later (you have {status.version}), so it won&apos;t fire yet.
        </Typography>
      )}
      {(error || (trigger?.blocks && !isAgent)) && (
        <Typography variant="caption" color={error ? 'error' : 'text.secondary'} sx={{ display: 'block', mt: 1 }}>
          {error || `If the command exits with code 2, ${trigger.blocks}.`}
        </Typography>
      )}
    </Box>
  );
}
