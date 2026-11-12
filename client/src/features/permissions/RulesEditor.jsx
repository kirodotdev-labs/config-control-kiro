/**
 * @fileoverview Edits a list of V3 permission rules, one card per rule, in
 * Kiro's terms: capability, effect, match (empty = all) and exclude. Each is
 * a dropdown with Kiro's descriptions or suggestions, and match and exclude
 * also take any typed pattern. Used for permissions.yaml and for an agent's
 * permissions block. The capability list is grouped: meta-capabilities (several
 * at once), then, for an agent, the capabilities its tools and setup give it,
 * then the rest. Unknown rule fields are kept.
 * Source: https://kiro.dev/docs/permissions/
 */
import { Alert, Autocomplete, Box, createFilterOptions, Button, IconButton, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import { usePermissionsMeta } from '../../data/useSettings';
import { EFFECT_COLOR, newRule } from '../../domain/permissions.js';
import { CAPABILITIES, EFFECT_LABELS, META_CAPABILITIES, suggestionsFor } from '../../domain/permRows.js';
import { useAllAgentIds } from '../../data/useAgents';
import { useMcpConfig } from '../../data/useMcp';
import { setField, stringList } from '../../domain/json.js';
import { ListInput } from '../../ui/ListInput';
import { SURFACE } from '../../theme';

const filterCaps = createFilterOptions({ stringify: (o) => `${o.cap} ${capLabel(o.cap)}` });
const capLabel = (cap) => CAPABILITIES.find((c) => c.cap === cap)?.label || '';

/**
 * @param {Object} props
 * @param {Object[]} props.rules
 * @param {(next: Object[]) => void} props.onChange
 * @param {Set<string>} [props.agentCaps] for an agent: the capabilities it can use.
 * @param {Object<string, string[]>} [props.servers] MCP servers and their tools, for MCP suggestions.
 * @param {string[]} [props.skills] skill names, for skill suggestions.
 * @param {string[]} [props.only] offer just these capabilities (e.g. the ones the sandbox follows).
 * @param {Object} [props.template] the rule Add rule starts from.
 * @param {string} [props.emptyText] shown when there are no rules.
 */
export function RulesEditor({ rules, onChange, agentCaps, servers, skills = [], only, template, emptyText }) {
  const { data: meta } = usePermissionsMeta();
  const all = meta?.capabilities || CAPABILITIES.map((c) => c.cap);
  const known = only ? all.filter((c) => only.includes(c)) : all;
  const { data: agents = [] } = useAllAgentIds();
  const mcpJson = useMcpConfig().data?.config?.mcpServers || {};
  const serverTools = servers || Object.fromEntries(Object.keys(mcpJson).map((s) => [s, []]));
  const meta3 = META_CAPABILITIES.filter((c) => known.includes(c));
  const own = agentCaps ? known.filter((c) => agentCaps.has(c) && !meta3.includes(c)) : [];
  const other = known.filter((c) => !meta3.includes(c) && !own.includes(c));
  const groups = [
    ['Several at once', meta3],
    ...(agentCaps ? [["This agent's tools and setup", own]] : []),
    [agentCaps ? 'Other capabilities' : 'Capabilities', other],
  ].filter(([, list]) => list.length);
  const update = (i, key, value) => onChange(rules.map((r, j) => (j === i ? setField(r, key, value) : r)));
  const remove = (i) => onChange(rules.filter((_, j) => j !== i));

  return (
    <Stack spacing={1.5}>
      {rules.map((rule, i) => {
        const { options, describe } = suggestionsFor(rule.capability, { servers: serverTools, agents, skills });
        const info = CAPABILITIES.find((c) => c.cap === rule.capability);
        const notHad = agentCaps && rule.capability && !agentCaps.has(rule.capability) && !['all', 'builtin', 'filesystem'].includes(rule.capability);
        return (
          <Box key={i} sx={{ p: 1.5, border: `1px solid ${SURFACE.border}`, borderRadius: 2 }} data-rule={i}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
              <Autocomplete freeSolo size="small" sx={{ flex: '3 1 0', minWidth: 0, '& input': { fontFamily: 'monospace' } }} value={rule.capability || ''} disableClearable
                options={groups.flatMap(([title, list]) => list.map((cap) => ({ cap, group: title })))}
                groupBy={(o) => o.group} getOptionLabel={(o) => (typeof o === 'string' ? o : o.cap)}
                filterOptions={(opts, state) => (state.inputValue === (rule.capability || '') ? opts : filterCaps(opts, state))} // the whole list until you type
                isOptionEqualToValue={(o, v) => o.cap === (typeof v === 'string' ? v : v.cap)}
                onChange={(_, v) => update(i, 'capability', typeof v === 'string' ? v.trim() : v?.cap || '')}
                onInputChange={(_, v, reason) => { if (reason === 'input') update(i, 'capability', v.trim()); }}
                renderOption={(props, o) => { const { key, ...rest } = props; return <li key={key} {...rest}><Box component="span" sx={{ fontFamily: 'monospace', mr: 1 }}>{o.cap}</Box><Typography component="span" variant="body2" color="text.secondary">{capLabel(o.cap)}</Typography></li>; }}
                renderInput={(params) => (
                  <TextField {...params} label="Capability" placeholder="Pick one, or type a name"
                    helperText={rule.capability && !all.includes(rule.capability) ? `Kiro CLI V3 has no ${rule.capability} capability. Kept, in case it's new.` : capLabel(rule.capability)} />
                )} />
              <TextField select size="small" label="Effect" value={rule.effect || ''} sx={{ flex: '2 1 0', minWidth: 0 }}
                onChange={(e) => update(i, 'effect', e.target.value)}
                slotProps={{ select: { sx: { color: `${EFFECT_COLOR[rule.effect] || 'text'}.main`, fontWeight: 600, fontFamily: 'monospace' }, renderValue: (v) => v } }}>
                {EFFECT_LABELS.map((e) => (
                  <MenuItem key={e.effect} value={e.effect}>
                    <Box component="span" sx={{ fontFamily: 'monospace', mr: 1, color: `${EFFECT_COLOR[e.effect]}.main` }}>{e.effect}</Box>
                    <Typography component="span" variant="body2" color="text.secondary">{e.label}</Typography>
                  </MenuItem>
                ))}
                {rule.effect && !EFFECT_LABELS.some((e) => e.effect === rule.effect) && <MenuItem value={rule.effect}>{rule.effect}</MenuItem>}
              </TextField>
              <Tooltip title="Remove rule"><IconButton sx={{ flexShrink: 0 }} onClick={() => remove(i)} aria-label="Remove rule"><Delete fontSize="small" /></IconButton></Tooltip>
            </Stack>
            <Stack spacing={1.5}>
              <ListInput label="Match" value={stringList(rule.match)} onChange={(v) => update(i, 'match', v)} options={options} describe={describe}
                placeholder="Empty matches all. Pick or type a pattern"
                helperText={info?.patterns || 'Glob patterns'} />
              <ListInput label="Exclude" value={stringList(rule.exclude)} onChange={(v) => update(i, 'exclude', v)} options={options} describe={describe}
                placeholder="Patterns that must not match (optional)" />
              {notHad && <Alert severity="info">This agent has no {rule.capability}, so this rule has no effect.</Alert>}
            </Stack>
          </Box>
        );
      })}
      {!rules.length && (
        <Typography variant="body2" color="text.secondary">{emptyText || 'No rules yet. Kiro uses its defaults: it reads files in the folder, runs read-only git commands, and asks about everything else.'}</Typography>
      )}
      <Box><Button startIcon={<Add />} onClick={() => onChange([...rules, template ? { ...template, match: [...(template.match || [])] } : newRule()])}>Add rule</Button></Box>
    </Stack>
  );
}
