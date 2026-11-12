/**
 * @fileoverview Small inputs the recipe editor shares: an agent picker (your
 * agents and Kiro's bundled workflow agents, free text kept), a model and
 * effort pair, and a stop condition.
 */
import { Autocomplete, Box, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useAllAgentIds } from '../../data/useAgents';
import { useModels } from '../../data/useKiro';
import { EFFORT_LEVELS } from '../../domain/effort.js';
import { BUNDLED_AGENTS, COMPLETION_SIGNALS } from '../../domain/workflows.js';
import { isObject } from '../../domain/json.js';

/** The agent that runs a step. */
export function AgentPicker({ value, onChange }) {
  const { data: ids = [] } = useAllAgentIds();
  const options = [
    ...BUNDLED_AGENTS.map((a) => ({ id: a.id, note: a.role, group: 'Bundled for workflows' })),
    ...ids.filter((id) => !BUNDLED_AGENTS.some((a) => a.id === id)).map((id) => ({ id, note: '', group: 'Your agents' })),
  ];
  return (
    <Autocomplete freeSolo size="small" value={value || ''} disableClearable options={options} groupBy={(o) => o.group}
      getOptionLabel={(o) => (typeof o === 'string' ? o : o.id)} isOptionEqualToValue={(o, v) => o.id === (typeof v === 'string' ? v : v.id)}
      onChange={(_, v) => onChange(typeof v === 'string' ? v.trim() : v?.id || '')}
      onInputChange={(_, v, reason) => { if (reason === 'input') onChange(v.trim()); }}
      filterOptions={(opts, s) => (s.inputValue === (value || '') ? opts : opts.filter((o) => `${o.id} ${o.note}`.toLowerCase().includes(s.inputValue.toLowerCase())))}
      renderOption={({ key, ...props }, o) => (
        <li key={key} {...props}><Box><Box component="span" sx={{ fontFamily: 'monospace' }}>{o.id}</Box>
          {o.note && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{o.note}</Typography>}</Box></li>
      )}
      renderInput={(params) => <TextField {...params} label="Agent" placeholder="wf-planner, wf-coder, or one of yours"
        helperText={BUNDLED_AGENTS.find((a) => a.id === value)?.role || (value ? 'The step uses this agent\'s tools and permissions.' : 'Required')} />}
      sx={{ '& input': { fontFamily: 'monospace' } }} />
  );
}

/** Model and effort overrides: empty inherits (step → workflow → chat → agent). */
export function ModelEffort({ node, onChange, inherit }) {
  const { data } = useModels();
  const models = data?.models || [];
  const model = typeof node.modelId === 'string' ? node.modelId : '';
  const effort = typeof node.effortLevel === 'string' ? node.effortLevel : '';
  return (
    <Stack direction="row" spacing={1.5}>
      <TextField select size="small" label="Model" value={model} sx={{ flex: 1 }} onChange={(e) => onChange('modelId', e.target.value || undefined)} helperText={`Empty: ${inherit}`}>
        <MenuItem value="">Inherit</MenuItem>
        <MenuItem value="auto">auto</MenuItem>
        {models.map((m) => <MenuItem key={m.id} value={m.id}>{m.name || m.id}</MenuItem>)}
        {model && model !== 'auto' && !models.some((m) => m.id === model) && <MenuItem value={model}>{model}</MenuItem>}
      </TextField>
      <TextField select size="small" label="Effort" value={effort} sx={{ flex: 1 }} onChange={(e) => onChange('effortLevel', e.target.value || undefined)} helperText="Empty: inherit">
        <MenuItem value="">Inherit</MenuItem>
        {EFFORT_LEVELS.map((l) => <MenuItem key={l} value={l}>{l}</MenuItem>)}
        {effort && !EFFORT_LEVELS.includes(effort) && <MenuItem value={effort}>{effort}</MenuItem>}
      </TextField>
    </Stack>
  );
}

const KINDS = [
  { value: '', label: 'None' },
  { value: 'containsText', label: 'Output contains text' },
  { value: 'completionSignal', label: 'The step signals' },
  { value: 'fileCheck', label: 'A JSON file has a value' },
];

/**
 * A stop condition (repeat stopCondition, step completion): any one match stops.
 * @param {{value: Object|undefined, onChange: (v: Object|undefined) => void, label: string, hint: string}} props
 */
export function StopCondition({ value, onChange, label, hint }) {
  const sc = isObject(value) ? value : {};
  const kind = KINDS.find((k) => k.value && k.value in sc)?.value || '';
  const set = (k) => {
    if (!k) onChange(undefined);
    else onChange({ [k]: k === 'containsText' ? 'DONE' : k === 'completionSignal' ? 'success' : { path: '.kiro/workflow-output/status.json', jsonPath: 'verdict', value: 'APPROVED' } });
  };
  const fc = isObject(sc.fileCheck) ? sc.fileCheck : {};
  const fileValue = typeof fc.value === 'string' ? fc.value : JSON.stringify(fc.value ?? '');
  return (
    <Stack spacing={1}>
      <TextField select size="small" label={label} value={kind} onChange={(e) => set(e.target.value)} helperText={hint}>
        {KINDS.map((k) => <MenuItem key={k.value} value={k.value}>{k.label}</MenuItem>)}
      </TextField>
      {kind === 'containsText' && <TextField size="small" label="Text" value={sc.containsText || ''} onChange={(e) => onChange({ containsText: e.target.value })} helperText="Matches when the latest captured output contains it" />}
      {kind === 'completionSignal' && (
        <TextField select size="small" label="Signal" value={sc.completionSignal || ''} onChange={(e) => onChange({ completionSignal: e.target.value })}
          helperText="success: the step finished; need_input: it asked you (send_message warning); error: it failed">
          {COMPLETION_SIGNALS.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
        </TextField>
      )}
      {kind === 'fileCheck' && (
        <Stack direction="row" spacing={1}>
          <TextField size="small" label="File" value={fc.path || ''} sx={{ flex: 2 }} onChange={(e) => onChange({ fileCheck: { ...fc, path: e.target.value } })} />
          <TextField size="small" label="Key (jsonPath)" value={fc.jsonPath || ''} sx={{ flex: 1 }} onChange={(e) => onChange({ fileCheck: { ...fc, jsonPath: e.target.value } })} helperText="A dotted path, e.g. verdict" />
          <TextField size="small" label="Equals" value={fileValue} sx={{ flex: 1 }}
            onChange={(e) => { let v = e.target.value; try { v = JSON.parse(v); } catch { /* keep as text */ } onChange({ fileCheck: { ...fc, value: v } }); }}
            helperText="true, a number, or text" />
        </Stack>
      )}
    </Stack>
  );
}
