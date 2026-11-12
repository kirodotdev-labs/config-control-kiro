/**
 * @fileoverview The input for one setting, chosen from its metadata: a
 * picker for on/off and fixed choices, your models and agents where the
 * setting names one, a number field with its range, chips for lists, and
 * JSON only for object settings. Clearing a value means "use the default".
 */
import { useState } from 'react';
import { Autocomplete, MenuItem, TextField } from '@mui/material';
import { useBuiltinAgents, useModels } from '../../data/useKiro';
import { useAllAgentIds } from '../../data/useAgents';
import { parseJson } from '../../domain/json.js';
import { ListInput } from '../../ui/ListInput';
import { EffortField } from './EffortField';

const UNSET = '__default__';

/** A select offering "Default" plus the given options. */
function Choice({ value, options, onChange, defaultLabel, error }) {
  const current = value === undefined ? UNSET : String(value);
  const known = options.some((o) => o.value === current);
  return (
    <TextField select size="small" fullWidth value={current} error={!!error} helperText={error}
      onChange={(e) => onChange(e.target.value === UNSET ? undefined : options.find((o) => o.value === e.target.value)?.raw ?? e.target.value)}>
      <MenuItem value={UNSET}><em>{defaultLabel}</em></MenuItem>
      {options.map((o) => <MenuItem key={o.value} value={o.value}>{o.label || o.value}</MenuItem>)}
      {current !== UNSET && !known && <MenuItem value={current}>{current} (not a listed value)</MenuItem>}
    </TextField>
  );
}

/** Free text with suggestions (models, agents, examples). */
function Suggest({ value, options, onChange, placeholder, error }) {
  return (
    <Autocomplete freeSolo size="small" fullWidth options={options} value={value ?? ''}
      onInputChange={(_, v, reason) => reason !== 'reset' && onChange(v === '' ? undefined : v)}
      onChange={(_, v) => onChange(v ? String(v) : undefined)}
      renderInput={(params) => <TextField {...params} placeholder={placeholder} error={!!error} helperText={error} />} />
  );
}

function ObjectField({ value, onChange, error }) {
  const [text, setText] = useState(value === undefined ? '' : JSON.stringify(value, null, 2));
  const [bad, setBad] = useState('');
  return (
    <TextField size="small" fullWidth multiline minRows={2} value={text} placeholder="{ }" error={!!(bad || error)}
      helperText={bad || error || 'JSON object. Leave empty to use the default.'}
      slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 12 } } }}
      onChange={(e) => {
        setText(e.target.value);
        if (!e.target.value.trim()) { setBad(''); onChange(undefined); return; }
        const p = parseJson(e.target.value);
        setBad(p.error ? 'Not valid JSON yet' : '');
        if (!p.error) onChange(p.value);
      }} />
  );
}

/**
 * @param {Object} props
 * @param {Object} props.setting metadata from kiro-cli.
 * @param {any} props.value undefined when not set in this file.
 * @param {(next: any) => void} props.onChange
 * @param {string} props.error
 * @param {string} props.defaultLabel e.g. "Kiro's default (off)" or "Global: on".
 */
export function SettingControl({ setting, value, onChange, error, defaultLabel }) {
  const { data: models } = useModels();
  const { data: agentIds = [] } = useAllAgentIds();
  const { data: builtins } = useBuiltinAgents(setting.key === 'chat.defaultAgent');
  const placeholder = defaultLabel;

  if (setting.type === 'boolean') {
    return <Choice value={value} defaultLabel={defaultLabel} error={error} onChange={onChange}
      options={[{ value: 'true', label: 'On', raw: true }, { value: 'false', label: 'Off', raw: false }]} />;
  }
  if (setting.choices?.length) {
    return <Choice value={value} defaultLabel={defaultLabel} error={error} onChange={onChange}
      options={setting.choices.map((c) => ({ value: c.value, label: c.label || c.value }))} />;
  }
  if (setting.key === 'chat.defaultModel') {
    return <Choice value={value} defaultLabel={defaultLabel} error={error} onChange={onChange}
      options={(models?.models || []).map((m) => ({ value: m.id, label: m.name || m.id }))} />;
  }
  if (setting.key === 'chat.defaultAgent') {
    return <Choice value={value} defaultLabel={defaultLabel} error={error} onChange={onChange}
      options={[
        ...(builtins?.agents || []).map((a) => ({ value: a.name, label: `${a.name} (built-in)` })),
        ...agentIds.filter((id) => !(builtins?.agents || []).some((a) => a.name === id)).map((id) => ({ value: id })),
      ]} />;
  }
  switch (setting.type) {
    case 'number':
      return (
        <TextField size="small" fullWidth type="number" value={value ?? ''} placeholder={placeholder} error={!!error}
          helperText={error || (setting.min != null ? `${setting.min} to ${setting.max}` : setting.examples?.[0] && `e.g. ${setting.examples[0]}`)}
          slotProps={{ htmlInput: { min: setting.min, max: setting.max } }}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />
      );
    case 'char':
      return (
        <TextField size="small" fullWidth value={value ?? ''} placeholder={placeholder} error={!!error} helperText={error || 'One character'}
          slotProps={{ htmlInput: { maxLength: 1, style: { fontFamily: 'monospace' } } }}
          onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)} />
      );
    case 'array':
      return <ListInput label="" value={Array.isArray(value) ? value : []} placeholder="Type a value and press Enter"
        onChange={(v) => onChange(v.length ? v : undefined)} helperText={error} />;
    case 'object': {
      const json = <ObjectField key={JSON.stringify(value)} value={value} onChange={onChange} error={error} />;
      return setting.key === 'chat.modelDefaults' ? <EffortField value={value} onChange={onChange} advanced={json} /> : json;
    }
    default:
      return <Suggest value={value} options={setting.examples || []} onChange={onChange} placeholder={placeholder} error={error} />;
  }
}
