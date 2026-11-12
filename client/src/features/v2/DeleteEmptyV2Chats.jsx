/**
 * @fileoverview Deletes every empty Kiro CLI 2.x chat with kiro-cli chat
 * --delete-session, after a confirmation. Kiro cleans up empty V3 chats in
 * its own dashboard. Removed with V2 support.
 */
import { Button } from '@mui/material';
import { useDeleteV2Chats } from '../../data/useV2';
import { errorMessage } from '../../data/errors';
import { folderLabel } from '../../domain/sessions.js';
import { useConfirm } from '../../ui/ConfirmProvider';
import { useNotify } from '../../ui/NotifyProvider';

/** @param {{sessions: Object[], workspaces: {name: string, path: string}[]}} props */
export function DeleteEmptyV2Chats({ sessions, workspaces }) {
  const remove = useDeleteV2Chats();
  const confirm = useConfirm();
  const notify = useNotify();
  const empties = sessions.filter((s) => s.empty && !s.parentId && !s.running && s.engine !== 'v3');
  const onDeleteEmpty = async () => {
    const sample = empties.slice(0, 5).map((s) => folderLabel(s.folder, workspaces).label).join(', ');
    if (!await confirm({
      title: `Delete ${empties.length} empty chat${empties.length === 1 ? '' : 's'}?`,
      body: `No message was ever sent in these chats (for example in ${sample}). Kiro deletes each one with kiro-cli chat --delete-session. This can't be undone. Chats with messages and chats open in a terminal are never touched. Kiro cleans up empty V3 chats in its own session dashboard.`,
      confirmLabel: 'Delete empty chats', danger: true,
    })) return;
    remove.mutate({ ids: empties.map((s) => s.id), onlyEmpty: true }, {
      onSuccess: (r) => {
        const skipped = Object.keys(r.skipped).length;
        notify(`Deleted ${r.deleted.length} empty chat${r.deleted.length === 1 ? '' : 's'}${skipped ? `. Left ${skipped} alone because they changed.` : '.'}`, skipped ? 'info' : 'success');
      },
      onError: (e) => notify(errorMessage(e), 'error'),
    });
  };
  if (!empties.length) return null;
  return (
    <Button size="small" color="error" variant="outlined" disabled={remove.isPending} onClick={onDeleteEmpty}>
      {remove.isPending ? 'Deleting…' : `Delete ${empties.length} empty 2.x chat${empties.length === 1 ? '' : 's'}…`}
    </Button>
  );
}
