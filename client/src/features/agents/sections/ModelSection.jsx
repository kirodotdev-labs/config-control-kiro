/**
 * @fileoverview The model the agent runs on, chosen from what kiro-cli
 * offers, and its reasoning effort (effortLevel, read by Kiro CLI V3).
 */
import { MenuItem, Stack, TextField } from '@mui/material';
import { useModels } from '../../../data/useKiro';
import { EFFORT_LEVELS } from '../../../domain/effort.js';
import { setField } from '../../../domain/json.js';

/** @param {{spec: Object, onChange: (next: Object) => void}} props */
export function ModelSection({ spec, onChange }) {
  const { data, isLoading } = useModels();
  const models = data?.models || [];
  const value = typeof spec.model === 'string' ? spec.model : '';
  const known = models.some((m) => m.id === value);
  const selected = models.find((m) => m.id === value);
  const effort = typeof spec.effortLevel === 'string' ? spec.effortLevel : '';
  return (
    <Stack spacing={2}>
      <TextField select size="small" label="Model" value={value}
        onChange={(e) => onChange(setField(spec, 'model', e.target.value))}
        helperText={isLoading ? 'Asking Kiro CLI for your models…'
          : data?.problem ? `Only "auto" is listed. ${data.problem.message} ${data.problem.fix}`
            : selected?.description || 'Leave empty to use your Kiro default model.'}>
        <MenuItem value=""><em>Kiro default{data?.default ? ` (${data.default})` : ''}</em></MenuItem>
        {models.map((m) => (
          <MenuItem key={m.id} value={m.id}>
            {m.name || m.id}{m.rateMultiplier ? ` · ${m.rateMultiplier}x credits` : ''}
          </MenuItem>
        ))}
        {value && !known && <MenuItem value={value}>{value} (not offered by kiro-cli)</MenuItem>}
      </TextField>
      <TextField select size="small" label="Reasoning effort" value={effort}
        onChange={(e) => onChange(setField(spec, 'effortLevel', e.target.value))}
        helperText="How long the model thinks before answering, in Kiro CLI V3 chats with this agent. Lower is faster and uses fewer credits; models without effort levels ignore it.">
        <MenuItem value=""><em>Model default</em></MenuItem>
        {EFFORT_LEVELS.map((l) => <MenuItem key={l} value={l}>{l}</MenuItem>)}
        {effort && !EFFORT_LEVELS.includes(effort) && <MenuItem value={effort}>{effort}</MenuItem>}
      </TextField>
    </Stack>
  );
}
