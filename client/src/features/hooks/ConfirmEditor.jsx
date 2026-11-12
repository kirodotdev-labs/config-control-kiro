/**
 * @fileoverview The confirm block of a Stop command hook: the question Kiro
 * asks before running the command, its options (each runs the command or
 * not) and an optional command that decides at run time.
 * Source: https://kiro.dev/docs/hooks/ ("Confirmation prompts").
 */
import { Box, Button, Checkbox, FormControlLabel, IconButton, Stack, Switch, TextField, Tooltip, Typography } from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import { NEW_CONFIRM } from '../../domain/hooks.js';
import { isObject, setField } from '../../domain/json.js';
import { SURFACE } from '../../theme';

/**
 * @param {Object} props
 * @param {Object} props.hook
 * @param {(next: Object) => void} props.onChange
 */
export function ConfirmEditor({ hook, onChange }) {
  const on = hook.confirm !== undefined;
  const confirm = isObject(hook.confirm) ? hook.confirm : {};
  const options = Array.isArray(confirm.options) ? confirm.options : [];
  const setConfirm = (next) => onChange({ ...hook, confirm: next });
  const setOption = (i, key, value) => setConfirm({ ...confirm, options: options.map((o, j) => (j === i ? { ...o, [key]: value } : o)) });
  const addOption = () => {
    let n = options.length + 1;
    while (options.some((o) => o.id === `option-${n}`)) n += 1;
    setConfirm({ ...confirm, options: [...options, { id: `option-${n}`, label: '', run: false }] });
  };
  const toggle = (e) => {
    if (e.target.checked) onChange({ ...hook, confirm: NEW_CONFIRM });
    else onChange(setField(hook, 'confirm', undefined));
  };

  return (
    <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 2, border: `1px solid ${SURFACE.border}` }} data-section="confirm">
      <FormControlLabel sx={{ m: 0 }} label="Ask before running" control={<Switch size="small" checked={on} onChange={toggle} />} />
      {on && (
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          <TextField size="small" label="Question" value={confirm.question || ''} onChange={(e) => setConfirm({ ...confirm, question: e.target.value })} />
          {options.map((o, i) => (
            <Stack key={i} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <TextField size="small" label="Button label" value={o.label || ''} sx={{ flex: 2 }} onChange={(e) => setOption(i, 'label', e.target.value)} />
              <TextField size="small" label="ID" value={o.id || ''} sx={{ flex: 1 }} onChange={(e) => setOption(i, 'id', e.target.value)}
                slotProps={{ input: { sx: { fontFamily: 'monospace' } } }} />
              <FormControlLabel sx={{ m: 0, whiteSpace: 'nowrap' }} label="Runs the command"
                control={<Checkbox size="small" checked={o.run === true} onChange={(e) => setOption(i, 'run', e.target.checked)} />} />
              <Tooltip title="Remove option">
                <IconButton size="small" onClick={() => setConfirm({ ...confirm, options: options.filter((_, j) => j !== i) })}><Delete fontSize="small" /></IconButton>
              </Tooltip>
            </Stack>
          ))}
          <Box><Button size="small" startIcon={<Add />} onClick={addOption}>Add option</Button></Box>
          <TextField size="small" label="Decide with a command (optional)" value={confirm.confirmCommand || ''}
            onChange={(e) => setConfirm(setField(confirm, 'confirmCommand', e.target.value))}
            slotProps={{ input: { sx: { fontFamily: 'monospace' } } }}
            helperText="Runs first. It can print JSON that skips the prompt or replaces the question and options. If it fails or prints something else, the question above is used." />
          <Typography variant="caption" color="text.secondary">Kiro shows the question when the agent finishes, with one button per option.</Typography>
        </Stack>
      )}
    </Box>
  );
}
