/**
 * @fileoverview The memories Kiro keeps: in Global all of them, in a
 * Workspace the Global ones plus this repository's. Select one to read it.
 * New memory, Edit and Delete go through Kiro itself (its memory methods over
 * kiro-cli acp), the same operations as /memories in a V3 chat, so Kiro
 * writes and syncs them; the app only reads Kiro's database.
 */
import { useState } from 'react';
import { Alert, Box, Button, Chip, Collapse, InputAdornment, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { Add, DeleteOutlined, Edit, Refresh, Search } from '@mui/icons-material';
import { useMemories, useMemoryActions, useScopeSettings } from '../../data/useSettings';
import { useKiroStatus } from '../../data/useKiro';
import { versionAtLeast } from '../../domain/version.js';
import { useConfirm } from '../../ui/ConfirmProvider';
import { useNotify } from '../../ui/NotifyProvider';
import { MemoryDialog } from './MemoryDialog';
import { errorMessage } from '../../data/errors';
import { MEMORY_FILTERS, filterMemories, memoryEditBlocker, memoryType, scopeLabel } from '../../domain/memory.js';
import { timeAgo } from '../../domain/sessions.js';
import { SURFACE } from '../../theme';

/** One labelled part of a memory, when it has text. */
function Part({ label, text }) {
  if (!text) return null;
  return (
    <Box>
      <Typography variant="overline" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{text}</Typography>
    </Box>
  );
}

/** A memory row; selecting it shows the full memory, with Edit and Delete. */
function MemoryRow({ m, open, onToggle, blocker, busy, onEdit, onDelete }) {
  const type = memoryType(m.type);
  return (
    <Box sx={{ borderBottom: `1px solid ${SURFACE.border}` }} data-memory={m.id}>
      <Box component="button" type="button" onClick={onToggle} aria-expanded={open}
        sx={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%', boxSizing: 'border-box', px: 1.5, py: 1, '&:hover': { bgcolor: 'action.hover' }, '&:focus-visible': { outline: 2, outlineColor: 'primary.main' } }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, flexGrow: 1, minWidth: 0 }} noWrap>{m.title}</Typography>
          <Tooltip title={type.hint}><Chip size="small" variant="outlined" label={type.label} /></Tooltip>
          {m.scopes.map((s) => (
            <Tooltip key={s} title={s === 'Global' ? 'Used in every workspace.' : `Used only in ${scopeLabel(s)}.`}>
              <Chip size="small" variant="outlined" color={s === 'Global' ? 'default' : 'primary'} label={scopeLabel(s)} />
            </Tooltip>
          ))}
          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 72, textAlign: 'right' }}>{timeAgo(m.updatedAt)}</Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" noWrap component="div">{m.summary}</Typography>
      </Box>
      <Collapse in={open} unmountOnExit>
        <Stack spacing={1} sx={{ px: 1.5, pb: 1.5 }}>
          <Part label="Content" text={m.content} />
          <Part label="Why" text={m.why} />
          <Part label="How to apply" text={m.howToApply} />
          <Typography variant="caption" color="text.secondary">
            {m.account ? 'Kept for your signed-in account. ' : ''}Created {new Date(m.createdAt).toLocaleString()} · updated {new Date(m.updatedAt).toLocaleString()} · {m.id}
          </Typography>
          <Tooltip title={blocker}>
            <Stack direction="row" spacing={1}>
              <Button size="small" startIcon={<Edit />} disabled={!!blocker || busy} onClick={onEdit}>Edit</Button>
              <Button size="small" color="inherit" startIcon={<DeleteOutlined />} disabled={!!blocker || busy} onClick={onDelete}>Delete</Button>
            </Stack>
          </Tooltip>
        </Stack>
      </Collapse>
    </Box>
  );
}

export function MemoryList() {
  const query = useMemories();
  const { global } = useScopeSettings();
  const { data: status } = useKiroStatus();
  const actions = useMemoryActions();
  const confirm = useConfirm();
  const notify = useNotify();
  const [editing, setEditing] = useState(null); // { memory? } while the dialog is open
  const [refusal, setRefusal] = useState('');
  const mode = typeof global?.['memory.mode'] === 'string' ? global['memory.mode'] : '';
  const blocker = memoryEditBlocker(status, mode, versionAtLeast);
  const busy = actions.create.isPending || actions.update.isPending || actions.remove.isPending;
  const [search, setSearch] = useState('');
  const [only, setOnly] = useState('');
  const [open, setOpen] = useState('');
  const d = query.data;
  const shown = d ? filterMemories(d.memories, search, only) : [];
  const filtering = !!(search || only);
  const errors = d ? d.stores.filter((s) => s.error) : [];
  // Where a new memory can apply: Global, this Workspace's repository, and repositories already in use.
  const scopes = ['Global', ...new Set([d?.repo, ...(d?.memories || []).flatMap((m) => m.scopes)].filter((s) => s && s !== 'Global' && s.startsWith('repo:')))];
  const open2 = (memory) => { setRefusal(''); setEditing({ memory }); };
  const onSave = (draft) => {
    const after = { onSuccess: () => { setEditing(null); notify(editing.memory ? 'Memory saved by Kiro' : 'Memory created by Kiro. New chats can recall it.', 'success'); }, onError: (e) => setRefusal(errorMessage(e)) };
    if (editing.memory) actions.update.mutate({ id: editing.memory.id, draft }, after);
    else actions.create.mutate(draft, after);
  };
  const onDelete = async (m) => {
    if (!await confirm({ title: `Delete ${m.title}?`, body: 'Kiro deletes the memory, on this computer and in your account. New chats can no longer recall it.', confirmLabel: 'Delete', danger: true })) return;
    actions.remove.mutate(m.id, { onSuccess: () => { setOpen(''); notify('Memory deleted by Kiro', 'success'); }, onError: (e) => notify(errorMessage(e), 'error') });
  };

  return (
    <Box sx={{ p: 2, borderRadius: 2, border: `1px solid ${SURFACE.border}` }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
        <Typography variant="overline" color="text.secondary" sx={{ flexGrow: 1 }}>
          What Kiro remembers{d ? ` (${filtering ? `${shown.length} of ` : ''}${d.memories.length})` : ''}
        </Typography>
        <Button size="small" startIcon={<Refresh />} onClick={() => query.refetch()} disabled={query.isFetching}>Refresh</Button>
        <Tooltip title={blocker}>
          <span><Button size="small" variant="outlined" startIcon={<Add />} disabled={!!blocker || busy} onClick={() => open2(undefined)}>New memory</Button></span>
        </Tooltip>
      </Stack>
      {query.isError && <Alert severity="error">{errorMessage(query.error)}</Alert>}
      {errors.map((s) => <Alert key={s.path} severity="warning" sx={{ mb: 1 }}>{s.error} ({s.path})</Alert>)}
      {d && d.memories.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
          <TextField size="small" fullWidth placeholder="Search memories" value={search} onChange={(e) => setSearch(e.target.value)}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }, htmlInput: { 'aria-label': 'Search memories' } }} />
          <TextField select size="small" label="Show" value={only} onChange={(e) => setOnly(e.target.value)} sx={{ minWidth: 170 }}>
            {MEMORY_FILTERS.map((f) => <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>)}
          </TextField>
        </Stack>
      )}
      {d && shown.map((m) => (
        <MemoryRow key={m.id} m={m} open={open === m.id} onToggle={() => setOpen(open === m.id ? '' : m.id)}
          blocker={blocker} busy={busy} onEdit={() => open2(m)} onDelete={() => onDelete(m)} />
      ))}
      {d && !d.memories.length && (
        <Typography variant="body2" color="text.secondary">
          {d.stores.length ? 'Kiro has no memories here yet.' : "Kiro hasn't saved any memories yet."} Memories appear once Memory is on and Kiro learns something in a V3 chat.
        </Typography>
      )}
      {d && d.memories.length > 0 && !shown.length && <Typography variant="body2" color="text.secondary">No memory matches.</Typography>}
      {d && d.elsewhere > 0 && (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
          {d.elsewhere} more {d.elsewhere === 1 ? 'memory is' : 'memories are'} for other repositories. Global shows them all.
        </Typography>
      )}
      {d && !d.repo && d.elsewhere > 0 && (
        <Typography variant="caption" color="text.secondary" component="div">
          This folder has no git remote Kiro recognises, so only Global memories apply here.
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
        {blocker || 'New memory, Edit and Delete go through Kiro, which saves the change and syncs it to your account, the same as /memories in a V3 chat.'}
      </Typography>
      <MemoryDialog open={!!editing} memory={editing?.memory} scopes={scopes} saving={actions.create.isPending || actions.update.isPending}
        error={refusal} onClose={() => setEditing(null)} onSave={onSave} />
    </Box>
  );
}
