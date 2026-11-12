/**
 * @fileoverview Deleting a chat through Kiro. A V3 chat opens Kiro's session
 * dashboard, where Kiro deletes it; a 2.x chat goes to the 2.x delete
 * (features/v2). Shared by the full chat list and an agent's own chats.
 */
import { deletedInKiro } from '../../domain/sessions.js';
import { useDeleteV2Chat } from '../v2/useDeleteV2Chat';
import { useResume } from './useResume';

/**
 * @param {Map<string, Object[]>} children subagent chats by parent id (childrenByParent).
 * @returns {{onDelete: (chat: Object) => Promise<void>, deleting: boolean}}
 */
export function useDeleteChat(children) {
  const resumer = useResume();
  const v2 = useDeleteV2Chat(children); // 2.x: remove with V2 support
  const onDelete = async (chat) => {
    if (deletedInKiro(chat)) {
      resumer.dashboard(chat.folder, 'Highlight the chat, press Ctrl+D, then y. Refresh here when you are done.');
      return;
    }
    await v2.deleteV2(chat);
  };
  return { onDelete, deleting: v2.deleting || resumer.pending };
}
