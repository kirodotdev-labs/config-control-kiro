/**
 * @fileoverview Creates an agent from just a name; everything else is set in
 * the editor that opens next.
 */
import { useEffect, useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';
import { useAgentMutations } from '../../data/useAgents';
import { errorMessage } from '../../data/errors';
import { AGENT_ID_PATTERN, newAgentSpec } from '../../domain/agentSpec.js';

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {(id: string) => void} props.onCreated
 * @param {string[]} props.existingIds
 */
export function NewAgentDialog({ open, onClose, onCreated, existingIds }) {
  const { create } = useAgentMutations();
  const [name, setName] = useState('');
  const [serverError, setServerError] = useState('');
  useEffect(() => { if (open) { setName(''); setServerError(''); } }, [open]);

  const id = name.trim();
  const error = !id ? ''
    : !AGENT_ID_PATTERN.test(id) ? 'Start with a letter or digit, then use only letters, digits, dots, dashes or underscores'
      : existingIds.includes(id) ? 'An agent with this name already exists here' : serverError;

  const submit = () => {
    if (!id || error) return;
    create.mutate(newAgentSpec(id), {
      onSuccess: (res) => onCreated(res.id),
      onError: (e) => setServerError(errorMessage(e)),
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>New agent</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The new agent starts with all built-in tools. You can set its prompt, model, tools and permissions next.
        </Typography>
        <TextField autoFocus fullWidth size="small" label="Name" placeholder="code-reviewer" value={name}
          onChange={(e) => { setName(e.target.value); setServerError(''); }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          error={!!error} helperText={error || 'Used as the file name, and to start it with kiro-cli --agent <name>'} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={!id || !!error || create.isPending}>
          {create.isPending ? 'Creating…' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
