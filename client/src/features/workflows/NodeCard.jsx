/**
 * @fileoverview The selected node of a workflow recipe: its type, id and the
 * fields that type has (kiro.dev/docs/workflows/authoring), its problems, and
 * buttons to move, remove or (for a container) add a node inside it.
 */
import { useRef, useState } from 'react';
import { Alert, Box, Button, Chip, IconButton, Menu, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { Add, ArrowDownward, ArrowUpward, Delete } from '@mui/icons-material';
import { childKey, insertOptions, JOIN_POLICIES, nodeLabel, NODE_TYPES, ON_MAX } from '../../domain/workflows.js';
import { isObject } from '../../domain/json.js';
import { KeyValueInput } from '../../ui/KeyValueInput';
import { SURFACE } from '../../theme';
import { AgentPicker, ModelEffort, StopCondition } from './fields';

const COLOR = { step: 'primary.light', sequence: 'text.secondary', repeat: 'warning.light', parallel: 'info.light', watch: 'success.light' };

/** "Add inside" menu: the five node types with what each does. */
function AddNodeMenu({ label = 'Add', onAdd, size = 'small' }) {
  const [anchor, setAnchor] = useState(null);
  return (
    <>
      <Button size={size} startIcon={<Add />} onClick={(e) => setAnchor(e.currentTarget)}>{label}</Button>
      <Menu open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)}>
        {NODE_TYPES.map((t) => (
          <MenuItem key={t.type} onClick={() => { setAnchor(null); onAdd(t.type); }}>
            <Box><Typography variant="body2">{t.label}</Typography><Typography variant="caption" color="text.secondary">{t.hint}</Typography></Box>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

/** A prompt box with Insert value: the templates this node can read. */
function PromptField({ value, onChange, options }) {
  const ref = useRef(null);
  const [anchor, setAnchor] = useState(null);
  const insert = (token) => {
    const el = ref.current;
    const at = el ? el.selectionStart : value.length;
    const end = el ? el.selectionEnd : value.length;
    onChange(value.slice(0, at) + token + value.slice(end));
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(at + token.length, at + token.length); } });
  };
  return (
    <Box>
      <TextField size="small" label="Prompt" value={value} onChange={(e) => onChange(e.target.value)} fullWidth multiline minRows={2} maxRows={10}
        inputRef={ref} helperText="What this step's agent does. Make the deliverable its final message: that is what later steps read." />
      <Button size="small" startIcon={<Add />} onClick={(e) => setAnchor(e.currentTarget)} disabled={!options.length}>Insert value</Button>
      <Menu open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} disableRestoreFocus>
        {options.map((o) => (
          <MenuItem key={o.token} onClick={() => { setAnchor(null); insert(o.token); }}>
            <Box component="span" sx={{ fontFamily: 'monospace', mr: 1 }}>{o.token}</Box>
            <Typography component="span" variant="caption" color="text.secondary">{o.label}</Typography>
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}

/**
 * @param {Object} props
 * @param {Object} props.recipe the whole recipe (for template scope).
 * @param {(string|number)[]} props.path this node's path.
 * @param {Object} props.node
 * @param {{severity: string, message: string}[]} props.problems this node's problems.
 * @param {(field: string, value: any) => void} props.onField
 * @param {(delta: number) => void} props.onMove
 * @param {() => void} props.onRemove
 * @param {(type: string) => void} props.onAddInside
 * @param {boolean} props.first
 * @param {boolean} props.last
 */
export function NodeCard({ recipe, path, node, problems, onField, onMove, onRemove, onAddInside, first, last }) {
  const t = node.type;
  const config = isObject(node.config) ? node.config : {};
  const setConfig = (k, v) => onField('config', Object.fromEntries(Object.entries({ ...config, [k]: v }).filter(([, x]) => x !== undefined && x !== '')));
  const num = (v) => (v === '' ? undefined : Number(v));
  const errors = problems.filter((p) => p.severity === 'error').length;
  return (
    <Box data-node={node.id || ''} sx={{ p: 1.25, borderRadius: 2, border: `1px solid ${errors ? 'rgba(244,67,54,.5)' : SURFACE.border}` }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="caption" sx={{ color: COLOR[t] || 'text.secondary', fontWeight: 700, minWidth: 76 }}>{nodeLabel(t)}</Typography>
        <TextField size="small" variant="standard" value={node.id || ''} onChange={(e) => onField('id', e.target.value.trim())} placeholder="id"
          slotProps={{ input: { sx: { fontFamily: 'monospace' } } }} sx={{ width: 220 }} />
        {t === 'step' && node.agent && <Chip size="small" variant="outlined" label={node.agent} sx={{ fontFamily: 'monospace' }} />}
        {t === 'repeat' && <Chip size="small" variant="outlined" label={`up to ${node.maxIterations ?? '?'}×`} />}
        {problems.length > 0 && <Chip size="small" color={errors ? 'error' : 'warning'} variant="outlined" label={`${problems.length} to fix`} />}
        <Box sx={{ flexGrow: 1 }} />
        <Tooltip title="Move up"><span><IconButton size="small" disabled={first} onClick={() => onMove(-1)} aria-label="Move up"><ArrowUpward fontSize="small" /></IconButton></span></Tooltip>
        <Tooltip title="Move down"><span><IconButton size="small" disabled={last} onClick={() => onMove(1)} aria-label="Move down"><ArrowDownward fontSize="small" /></IconButton></span></Tooltip>
        <Tooltip title="Remove"><IconButton size="small" onClick={onRemove} aria-label="Remove node"><Delete fontSize="small" /></IconButton></Tooltip>
      </Stack>
      <Stack spacing={1.25} sx={{ mt: 1 }}>
        {problems.map((p) => <Alert key={p.message} severity={p.severity === 'error' ? 'error' : 'warning'} variant="outlined" sx={{ py: 0 }}>{p.message}</Alert>)}
        {t === 'step' && (
          <>
            <AgentPicker value={node.agent} onChange={(v) => onField('agent', v || undefined)} />
            <PromptField value={node.prompt || ''} onChange={(v) => onField('prompt', v)} options={insertOptions(recipe, path)} />
            <KeyValueInput label="Artifacts" keyLabel="Name" value={isObject(node.artifacts) ? node.artifacts : {}} onChange={(v) => onField('artifacts', Object.keys(v).length ? v : undefined)}
              hint="Files this step writes, by name. Later steps read the path as {{artifacts.<name>}}." />
            <ModelEffort node={node} onChange={onField} inherit="the workflow's model, then the chat's" />
            <StopCondition value={node.completion} onChange={(v) => onField('completion', v)} label="Keep the step open until"
              hint="Optional: an interactive step stays open until this matches. Not allowed inside a parallel." />
          </>
        )}
        {t === 'repeat' && (
          <>
            <Stack direction="row" spacing={1.5}>
              <TextField size="small" type="number" label="At most (maxIterations)" value={node.maxIterations ?? ''} sx={{ width: 200 }}
                onChange={(e) => onField('maxIterations', num(e.target.value))} helperText="It always runs at least once" />
              <TextField select size="small" label="At the cap (onMaxIterations)" value={node.onMaxIterations || ''} sx={{ flex: 1 }} onChange={(e) => onField('onMaxIterations', e.target.value)}>
                {ON_MAX.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </TextField>
            </Stack>
            {'stopWhen' in node
              ? <TextField size="small" label="Stop when (stopWhen)" value={node.stopWhen || ''} onChange={(e) => onField('stopWhen', e.target.value)}
                  helperText='"<watch id>.terminal", or "{{<id>.output}} contains <text>". Clear it to use a stop condition instead.' />
              : <StopCondition value={node.stopCondition} onChange={(v) => onField('stopCondition', v)} label="Stop when"
                  hint="Checked after each pass. None: it runs to the cap." />}
            {!('stopWhen' in node) && !node.stopCondition && <Button size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => onField('stopWhen', 'wait.terminal')}>Use stopWhen instead</Button>}
          </>
        )}
        {t === 'parallel' && (
          <TextField select size="small" label="Join (joinPolicy)" value={node.joinPolicy || ''} onChange={(e) => onField('joinPolicy', e.target.value)}
            helperText="Each branch runs in its own context; branches can't read each other's output.">
            {JOIN_POLICIES.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </TextField>
        )}
        {t === 'watch' && (
          <>
            <TextField select size="small" label="Wait for (handler)" value={node.handler || ''} onChange={(e) => onField('handler', e.target.value)}>
              <MenuItem value="github-pr">github-pr: a pull request (merged, closed, new comments, reviews, failed checks)</MenuItem>
              <MenuItem value="command">command: a script of yours that reports idle, new-activity or terminal-state</MenuItem>
            </TextField>
            {node.handler === 'github-pr' && (
              <Stack direction="row" spacing={1.5}>
                <TextField size="small" label="PR file (prRef) or URL" value={config.prRef || config.url || ''} sx={{ flex: 2 }}
                  onChange={(e) => { const v = e.target.value; onField('config', { ...Object.fromEntries(Object.entries(config).filter(([k]) => k !== 'prRef' && k !== 'url')), [/^https?:/.test(v) ? 'url' : 'prRef']: v }); }}
                  helperText="A workspace JSON file with a top-level url (written by an earlier step), or the PR URL" />
                <TextField size="small" type="number" label="Poll every (s)" value={config.pollIntervalSec ?? ''} sx={{ flex: 1 }} onChange={(e) => setConfig('pollIntervalSec', num(e.target.value))} helperText="Default 60, minimum 30" />
              </Stack>
            )}
            {node.handler === 'command' && (
              <Stack direction="row" spacing={1.5}>
                <TextField size="small" label="Command" value={config.command || ''} sx={{ flex: 2 }} onChange={(e) => setConfig('command', e.target.value)}
                  slotProps={{ input: { sx: { fontFamily: 'monospace' } } }} helperText="One command line, arguments included; no templates" />
                <TextField size="small" type="number" label="Poll every (s)" value={config.pollIntervalSec ?? ''} sx={{ flex: 1 }} onChange={(e) => setConfig('pollIntervalSec', num(e.target.value))} helperText="Default 60, minimum 10" />
              </Stack>
            )}
            <TextField size="small" type="number" label="Give up after idle (idleTimeoutSec)" value={node.idleTimeoutSec ?? ''} sx={{ width: 280 }}
              onChange={(e) => onField('idleTimeoutSec', num(e.target.value))} helperText="Seconds with no change; then it ends as terminal" />
          </>
        )}
        {childKey(t) && (
          <Typography variant="caption" color="text.secondary">
            {NODE_TYPES.find((x) => x.type === t)?.hint} {(node[childKey(t)] || []).length ? '' : 'Nothing inside yet.'}
          </Typography>
        )}
        {childKey(t) && <Box><AddNodeMenu label={t === 'parallel' ? 'Add branch' : 'Add inside'} onAdd={onAddInside} /></Box>}
      </Stack>
    </Box>
  );
}
