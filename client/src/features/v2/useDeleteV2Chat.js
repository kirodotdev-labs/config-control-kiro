/**
 * @fileoverview Deleting a Kiro CLI 2.x chat with kiro-cli chat --delete-session,
 * after a confirmation, with an offer to delete the subagent chats it started.
 * Kiro deletes V3 chats in its own dashboard instead. Removed with V2 support.
 */
import { useDeleteV2Chats } from '../../data/useV2';
import { errorMessage } from '../../data/errors';
import { deleteBlocker, deletedInKiro } from '../../domain/sessions.js';
import { useConfirm } from '../../ui/ConfirmProvider';
import { useNotify } from '../../ui/NotifyProvider';

/**
 * @param {Map<string, Object[]>} children subagent chats by parent id.
 * @returns {{deleteV2: (chat: Object) => Promise<void>, deleting: boolean}}
 */
export function useDeleteV2Chat(children) {
  const remove = useDeleteV2Chats();
  const confirm = useConfirm();
  const notify = useNotify();
  const title = (c) => (c.empty ? 'this empty chat' : `"${c.title || 'Untitled chat'}"`);
  const deleteV2 = async (chat) => {
    if (!await confirm({
      title: `Delete ${title(chat)}?`,
      body: `Kiro deletes this chat and its history with kiro-cli chat --delete-session. This can't be undone, and you won't be able to resume it. Its tags are removed too.`,
      confirmLabel: 'Delete chat', danger: true,
    })) return;
    const kids = [];
    const collect = (id) => (children.get(id) || []).forEach((c) => { kids.push(c); collect(c.id); });
    collect(chat.id);
    const deletable = kids.filter((c) => !deleteBlocker(c) && !deletedInKiro(c));
    let ids = [chat.id];
    if (deletable.length && await confirm({
      title: `Also delete its ${deletable.length} subagent chat${deletable.length === 1 ? '' : 's'}?`,
      body: 'These are the conversations of subagents this chat started. Choose Keep to delete only the chat itself.',
      confirmLabel: 'Delete them too', cancelLabel: 'Keep', danger: true,
    })) ids = ids.concat(deletable.map((c) => c.id));
    remove.mutate({ ids }, {
      onSuccess: (r) => {
        const skipped = Object.values(r.skipped);
        if (!r.deleted.length) notify(`Kiro didn't delete it: ${skipped[0] || 'unknown reason'}.`, 'error');
        else notify(`Deleted ${r.deleted.length === 1 ? 'the chat' : `${r.deleted.length} chats`}${skipped.length ? `. Left ${skipped.length} alone: ${skipped[0]}.` : '.'}`, skipped.length ? 'info' : 'success');
      },
      onError: (e) => notify(errorMessage(e), 'error'),
    });
  };
  return { deleteV2, deleting: remove.isPending };
}
