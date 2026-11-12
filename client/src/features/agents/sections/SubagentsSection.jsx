/**
 * @fileoverview Which agents this agent may start as sub-agents, and which
 * of those start without asking, the V3 way: none, only the named ones
 * (`subagent/<name>` in tools), or any agent (the subagent tag); and an allow
 * rule for the subagent capability in permissions.
 * Source: kiro.dev/docs/custom-agents/subagents.
 */
import { useState } from 'react';
import { Alert, FormControlLabel, Radio, RadioGroup, Stack, Typography } from '@mui/material';
import { useAllAgentIds } from '../../../data/useAgents';
import { setField } from '../../../domain/json.js';
import {
  setSubagentMode, setTrustedSubagents, subagentMode, subagentTargets, trustedSubagents,
} from '../../../domain/subagents.js';
import { ListInput } from '../../../ui/ListInput';

const BROAD = { '*': 'Everything (*)', '@builtin': 'All built-in (@builtin)' };

/** @param {{spec: Object, onChange: (next: Object) => void, v2: boolean}} props v2: the 2.x sub-agent settings still need Kiro's upgrade. */
export function SubagentsSection({ spec, onChange, v2 }) {
  const { data: ids = [] } = useAllAgentIds();
  const targets = subagentTargets(spec.tools);
  const saved = subagentMode(spec.tools);
  // "Only these agents" with no name yet is the same tools list as None, so
  // the choice is held here until a name is added.
  const [choosingSome, setChoosingSome] = useState(false);
  const mode = choosingSome && saved.mode === 'none' ? 'some' : saved.mode;
  const { because } = saved;
  const fixedByTools = BROAD[because];
  const setTools = (next) => onChange(setField(spec, 'tools', next, { keepEmpty: 'tools' in spec }));
  return (
    <Stack spacing={1.5}>
      {/* 2.x: remove with V2 support */}
      {v2 && (
        <Alert severity="info">
          These sub-agents are still set the CLI 2.x way (toolsSettings.subagent). The Kiro CLI V3 card above explains how Kiro
          converts them.
        </Alert>
      )}
      <Typography variant="body2" color="text.secondary">Which agents can it start?</Typography>
      <RadioGroup value={mode} onChange={(e) => { setChoosingSome(e.target.value === 'some'); setTools(setSubagentMode(spec.tools, e.target.value, targets)); }}>
        <FormControlLabel value="none" disabled={!!fixedByTools} control={<Radio size="small" />} label="None" />
        <FormControlLabel value="some" disabled={!!fixedByTools} control={<Radio size="small" />} label="Only these agents" />
        <FormControlLabel value="any" disabled={!!fixedByTools} control={<Radio size="small" />} label="Any agent" />
      </RadioGroup>
      {fixedByTools && (
        <Alert severity="info">
          Tools has {fixedByTools}, which lets this agent start any agent. To choose None or Only these agents, turn it off in Tools.
        </Alert>
      )}
      {mode === 'some' && (
        <ListInput label="May start" value={targets} options={ids}
          onChange={(names) => setTools(setSubagentMode(spec.tools, 'some', names))}
          helperText={targets.length ? "Saved in Tools as subagent/<name>. Type a name and press Enter for an agent that isn't listed."
            : 'Add at least one agent. Until then it can start none.'} />
      )}
      {mode !== 'none' && (
        <ListInput label="Start without asking" value={trustedSubagents(spec.permissions)} options={mode === 'some' ? targets : ids}
          onChange={(names) => onChange(setTrustedSubagents(spec, names))}
          helperText="Saved in Permissions as an allow rule for the subagent capability. Each sub-agent's own tool calls are still checked against this agent's permissions." />
      )}
    </Stack>
  );
}
