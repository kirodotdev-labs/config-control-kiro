/**
 * @fileoverview chat.modelDefaults as a list: pick a reasoning effort per
 * model, or edit the full JSON (thinking, max_tokens, ...) under Advanced.
 */
import { useState } from 'react';
import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useModels } from '../../data/useKiro';
import { EFFORT_LEVELS, effortOf, supportsEffort, withEffort } from '../../domain/effort.js';

/**
 * @param {Object} props
 * @param {Object|undefined} props.value chat.modelDefaults
 * @param {(next: Object|undefined) => void} props.onChange
 * @param {React.ReactNode} props.advanced the plain JSON field
 */
export function EffortField({ value, onChange, advanced }) {
  const { data } = useModels();
  const [showJson, setShowJson] = useState(false);
  const known = (data?.models || []).filter((m) => supportsEffort(m.id)).map((m) => m.id);
  const ids = [...new Set([...known, ...Object.keys(value || {})])];
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        Lower effort answers faster and uses fewer credits; higher effort thinks longer. Kiro uses each model&apos;s own default when none is set.
        Models that don&apos;t support a level ignore it.
      </Typography>
      <Stack spacing={0.75} sx={{ mt: 1 }}>
        {ids.map((id) => (
          <Stack key={id} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', flexGrow: 1, minWidth: 0 }} noWrap title={id}>{id}</Typography>
            <TextField select size="small" sx={{ width: 150 }} value={effortOf(value, id)}
              slotProps={{ htmlInput: { 'aria-label': `Effort for ${id}` } }}
              onChange={(e) => onChange(withEffort(value, id, e.target.value))}>
              <MenuItem value=""><em>Model default</em></MenuItem>
              {EFFORT_LEVELS.map((l) => <MenuItem key={l} value={l}>{l}</MenuItem>)}
            </TextField>
          </Stack>
        ))}
        {!ids.length && <Typography variant="body2" color="text.secondary">No models with reasoning effort were listed by Kiro CLI.</Typography>}
      </Stack>
      <Button size="small" sx={{ mt: 1 }} onClick={() => setShowJson(!showJson)}>{showJson ? 'Hide' : 'Edit as JSON (thinking, max_tokens…)'}</Button>
      {showJson && <Box sx={{ mt: 1 }}>{advanced}</Box>}
    </Box>
  );
}
