/**
 * @fileoverview Renames or deletes a tag on every chat that has it.
 */
import { useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { Delete } from '@mui/icons-material';
import { useChatActions } from '../../data/useSessions';
import { errorMessage } from '../../data/errors';
import { normalizeTag } from '../../domain/sessions.js';
import { useConfirm } from '../../ui/ConfirmProvider';
import { useNotify } from '../../ui/NotifyProvider';

function TagRow({ tag, count, onRename, onDelete, busy }) {
  const [name, setName] = useState(tag);
  const next = normalizeTag(name);
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <TextField size="small" value={name} onChange={(e) => setName(e.target.value)} sx={{ flexGrow: 1 }}
        slotProps={{ htmlInput: { 'aria-label': `Rename #${tag}` } }}
        helperText={`${count} chat${count === 1 ? '' : 's'}${next && next !== name.replace(/^#/, '') ? ` · saved as #${next}` : ''}`} />
      <Button disabled={busy || !next || next === tag} onClick={() => onRename(tag, next)}>Rename</Button>
      <Tooltip title={`Remove #${tag} from every chat`}>
        <span><IconButton disabled={busy} onClick={() => onDelete(tag, count)} aria-label={`Delete #${tag}`}><Delete fontSize="small" /></IconButton></span>
      </Tooltip>
    </Stack>
  );
}

/** @param {{open: boolean, onClose: () => void, tags: {tag: string, count: number}[]}} props */
export function ManageTagsDialog({ open, onClose, tags }) {
  const { renameTag } = useChatActions();
  const confirm = useConfirm();
  const notify = useNotify();
  const run = (from, to, done) => renameTag.mutate({ from, to }, {
    onSuccess: () => notify(done, 'success'),
    onError: (e) => notify(errorMessage(e), 'error'),
  });
  const onDelete = async (tag, count) => {
    if (await confirm({ title: `Delete #${tag}?`, body: `It is removed from ${count} chat${count === 1 ? '' : 's'}. The chats themselves stay.`, confirmLabel: 'Delete tag', danger: true })) {
      run(tag, '', `#${tag} deleted`);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Manage tags</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Renaming a tag changes it on every chat. If the new name already exists, the two tags merge.
        </Typography>
        <Stack spacing={1.5}>
          {tags.length ? tags.map((t) => (
            <TagRow key={t.tag} tag={t.tag} count={t.count} busy={renameTag.isPending} onDelete={onDelete}
              onRename={(from, to) => run(from, to, `#${from} renamed to #${to}`)} />
          )) : <Typography variant="body2">No tags yet. Use Add tag on a chat to create one.</Typography>}
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Done</Button></DialogActions>
    </Dialog>
  );
}
