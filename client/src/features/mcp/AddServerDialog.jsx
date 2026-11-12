/**
 * @fileoverview Adds MCP servers, either from a short form (name plus a
 * command line or a URL) or by pasting JSON copied from a server's README.
 */
import { useEffect, useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField,
  ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import { useSystemInfo } from '../../data/useSystem';
import { parseServers, toWsl } from '../../domain/mcp.js';
import { formatJson } from '../../domain/json.js';
import { CodeEditor } from '../../ui/CodeEditor';

/** Splits a command line on spaces, keeping "quoted parts" together. */
const splitCommand = (line) => (line.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((p) => p.replace(/^["']|["']$/g, ''));

/** @returns {{servers: Object|null, error: string}} what the form describes. */
function fromForm({ name, kind, target }) {
  if (!name.trim()) return { servers: null, error: 'Enter a name for the server' };
  if (!target.trim()) return { servers: null, error: kind === 'url' ? 'Enter the server URL' : 'Enter the command that starts the server' };
  if (kind === 'url') return { servers: { [name.trim()]: { url: target.trim() } }, error: '' };
  const [command, ...args] = splitCommand(target.trim());
  return { servers: { [name.trim()]: args.length ? { command, args } : { command } }, error: '' };
}

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string[]} props.existing names already in use.
 * @param {(servers: Object) => void} props.onAdd
 */
export function AddServerDialog({ open, onClose, existing, onAdd }) {
  const { data: info } = useSystemInfo();
  const [mode, setMode] = useState('form');
  const [form, setForm] = useState({ name: '', kind: 'command', target: '' });
  const [json, setJson] = useState('');

  useEffect(() => { if (open) { setMode('form'); setForm({ name: '', kind: 'command', target: '' }); setJson(''); } }, [open]);

  const result = mode === 'form' ? fromForm(form) : parseServers(json);
  const taken = result.servers ? Object.keys(result.servers).filter((n) => existing.includes(n)) : [];
  const error = result.error || (taken.length ? `Already exists: ${taken.join(', ')}` : '');
  const touched = mode === 'form' ? form.name || form.target : json.trim();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add MCP server</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, v) => v && setMode(v)}>
          <ToggleButton value="form">Simple</ToggleButton>
          <ToggleButton value="json">Paste JSON</ToggleButton>
        </ToggleButtonGroup>
        {mode === 'form' ? (
          <Stack spacing={2}>
            <TextField size="small" label="Name" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <ToggleButtonGroup size="small" exclusive value={form.kind} onChange={(_, v) => v && setForm({ ...form, kind: v })}>
              <ToggleButton value="command">Local command</ToggleButton>
              <ToggleButton value="url">Remote URL</ToggleButton>
            </ToggleButtonGroup>
            <TextField size="small" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}
              label={form.kind === 'url' ? 'URL' : 'Command line'}
              placeholder={form.kind === 'url' ? 'https://example.com/mcp' : 'uvx awslabs.aws-documentation-mcp-server@latest'}
              slotProps={{ input: { sx: { fontFamily: 'monospace' } } }} />
          </Stack>
        ) : (
          <Stack spacing={1} sx={{ height: 260 }}>
            <CodeEditor value={json} onChange={setJson} />
          </Stack>
        )}
        {touched && error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        {info?.isWSL && mode === 'json' && result.servers && (
          <Button sx={{ mr: 'auto' }} onClick={() => setJson(formatJson(toWsl(result.servers)))}
            title="For Kiro on Windows: start these servers inside WSL">
            Run through WSL
          </Button>
        )}
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!!error} onClick={() => { onAdd(result.servers); onClose(); }}>Add</Button>
      </DialogActions>
    </Dialog>
  );
}
