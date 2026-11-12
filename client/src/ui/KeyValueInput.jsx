/**
 * @fileoverview Edits a string map (environment variables, HTTP headers) as
 * rows. Values whose name looks secret are masked until revealed.
 */
import { useState } from 'react';
import { Box, Button, IconButton, Stack, TextField, Typography } from '@mui/material';
import { Add, Delete, Visibility, VisibilityOff } from '@mui/icons-material';

const SECRET = /token|secret|password|passwd|key|auth|credential/i;

/**
 * @param {Object} props
 * @param {string} props.label section label, e.g. "Environment".
 * @param {Object<string,string>} props.value
 * @param {(next: Object<string,string>) => void} props.onChange
 * @param {string} [props.keyLabel]
 * @param {string} [props.hint]
 */
export function KeyValueInput({ label, value, onChange, keyLabel = 'Name', hint }) {
  const rows = Object.entries(value || {});
  const [revealed, setRevealed] = useState({});

  const update = (index, k, v) => {
    const next = rows.map((row, i) => (i === index ? [k, v] : row));
    onChange(Object.fromEntries(next));
  };
  const remove = (index) => onChange(Object.fromEntries(rows.filter((_, i) => i !== index)));
  const add = () => {
    let name = 'NAME';
    for (let i = 2; name in (value || {}); i += 1) name = `NAME_${i}`;
    onChange({ ...value, [name]: '' });
  };

  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Stack spacing={1} sx={{ mt: 0.5 }}>
        {rows.map(([k, v], i) => {
          const masked = SECRET.test(k) && !revealed[k];
          return (
            <Stack sx={{ alignItems: "center" }} key={i} direction="row" spacing={1}>
              <TextField size="small" label={keyLabel} value={k} sx={{ flex: '0 0 38%' }}
                onChange={(e) => update(i, e.target.value, v)} />
              <TextField size="small" label="Value" value={String(v ?? '')} fullWidth
                type={masked ? 'password' : 'text'} onChange={(e) => update(i, k, e.target.value)} />
              {SECRET.test(k) && (
                <IconButton size="small" aria-label={masked ? 'Show value' : 'Hide value'}
                  onClick={() => setRevealed((r) => ({ ...r, [k]: !r[k] }))}>
                  {masked ? <Visibility fontSize="small" /> : <VisibilityOff fontSize="small" />}
                </IconButton>
              )}
              <IconButton size="small" aria-label="Remove" onClick={() => remove(i)}><Delete fontSize="small" /></IconButton>
            </Stack>
          );
        })}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mt: 1 }}>
        <Button size="small" startIcon={<Add />} onClick={add}>Add</Button>
        {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
      </Stack>
    </Box>
  );
}
