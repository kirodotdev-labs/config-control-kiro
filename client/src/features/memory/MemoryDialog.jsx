/**
 * @fileoverview New memory and Edit: a form for the fields Kiro keeps, checked
 * as Kiro checks them. Saving goes through Kiro itself (its memory methods
 * over kiro-cli acp), so Kiro writes and syncs the memory; the app never
 * writes Kiro's database. Kiro can't move a memory to another scope, so
 * Edit shows where it applies without changing it.
 */
import { useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { MEMORY_TYPES, draftProblems, scopeLabel, titleSlug } from '../../domain/memory.js';

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {Object} [props.memory] the memory to edit; none for a new one.
 * @param {string[]} props.scopes where a new memory can apply: Global first, then repositories.
 * @param {boolean} props.saving
 * @param {string} props.error Kiro's answer when it refused.
 * @param {() => void} props.onClose
 * @param {(draft: Object) => void} props.onSave
 */
export function MemoryDialog({ open, memory, scopes, saving, error, onClose, onSave }) {
  const blank = { type: 'USER_PREFERENCE', scope: 'Global', title: '', summary: '', content: '' };
  const from = (m) => (m ? { type: m.type, scope: m.scopes[0] || 'Global', title: m.title, summary: m.summary, content: m.content } : blank);
  const [d, setD] = useState(from(memory));
  const [touched, setTouched] = useState(false);
  const [last, setLast] = useState({ open, memory });
  if (open !== last.open || memory !== last.memory) { setLast({ open, memory }); if (open) { setD(from(memory)); setTouched(false); } }
  const problems = draftProblems(d, { create: !memory });
  const valid = !Object.keys(problems).length;
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const show = (k) => (touched ? problems[k] : '');
  const save = () => { setTouched(true); if (valid) onSave(d); };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{memory ? `Edit ${memory.title}` : 'New memory'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Kiro saves it like a memory it learned, so new chats can recall it when a request matches its description.
        </Typography>
        <Stack direction="row" spacing={1.5}>
          <TextField select size="small" label="Type" value={d.type} onChange={(e) => set('type', e.target.value)} sx={{ flex: 1 }}
            helperText={MEMORY_TYPES[d.type]?.hint} error={!!show('type')}>
            {Object.entries(MEMORY_TYPES).map(([v, t]) => <MenuItem key={v} value={v}>{t.label}</MenuItem>)}
          </TextField>
          {memory ? (
            <TextField size="small" label="Applies to" value={memory.scopes.map(scopeLabel).join(', ')} disabled sx={{ flex: 1 }}
              helperText="Kiro can't move a memory; make a new one to use it elsewhere" />
          ) : (
            <TextField select size="small" label="Applies to" value={d.scope} onChange={(e) => set('scope', e.target.value)} sx={{ flex: 1 }}
              helperText={d.scope === 'Global' ? 'Every chat' : `Only chats in ${scopeLabel(d.scope)}`} error={!!show('scope')}>
              {scopes.map((s) => <MenuItem key={s} value={s}>{s === 'Global' ? 'Global' : `Repository ${scopeLabel(s)}`}</MenuItem>)}
            </TextField>
          )}
        </Stack>
        <TextField size="small" label="Title" value={d.title} onChange={(e) => set('title', e.target.value)}
          onBlur={() => d.title && !/^[A-Za-z0-9-]+$/.test(d.title) && set('title', titleSlug(d.title))}
          error={!!show('title')} helperText={show('title') || 'A short dash-slug, e.g. seed-db-before-tests (at most 50 characters)'}
          slotProps={{ input: { sx: { fontFamily: 'monospace' } } }} />
        <TextField size="small" label="Description" value={d.summary} onChange={(e) => set('summary', e.target.value.replace(/\n/g, ' '))}
          error={!!show('summary')} helperText={show('summary') || `What it covers and when to use it. Kiro matches requests against this line (${d.summary.length}/200)`} />
        <TextField size="small" label="Content" value={d.content} onChange={(e) => set('content', e.target.value)} multiline minRows={4} maxRows={14}
          error={!!show('content')} helperText={show('content') || 'What Kiro should know or do'} />
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || (touched && !valid)}>{saving ? 'Saving through Kiro…' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
}
