/**
 * @fileoverview Reopens a Kiro chat in a new terminal, in the folder it was
 * started in, with the command Kiro needs for that chat's engine; and opens
 * Kiro's V3 session dashboard, where V3 chats are deleted.
 */
import { useLaunch } from '../../data/useLaunch';
import { useSystemInfo } from '../../data/useSystem';
import { errorMessage } from '../../data/errors';
import { withDirectory } from '../../domain/launch.js';
import { useNotify } from '../../ui/NotifyProvider';

/** Kiro's V3 session dashboard; --v3 so it opens even when chat.agentEngine is saved as v2. */
const DASHBOARD_COMMAND = 'kiro-cli chat --v3 --sessions';

/** @returns {{resume: (chat: Object) => void, dashboard: (folder: string, hint: string) => void, copyText: (chat: Object) => string, pending: boolean}} */
export function useResume() {
  const launch = useLaunch();
  const notify = useNotify();
  const { data: info } = useSystemInfo();
  const powershell = info?.platform === 'windows' && !info?.isWSL;
  return {
    pending: launch.isPending,
    copyText: (chat) => withDirectory(chat.folder, chat.resumeCommand, powershell),
    resume: (chat) => launch.mutate({ directory: chat.folder, command: chat.resumeCommand }, {
      onSuccess: () => notify('Opening the chat in a new terminal.', 'success'),
      onError: (e) => notify(e?.response?.data?.code === 'DIRECTORY_NOT_FOUND'
        ? `The folder this chat was started in no longer exists: ${chat.folder}`
        : errorMessage(e), 'error'),
    }),
    dashboard: (folder, hint) => launch.mutate({ directory: folder, command: DASHBOARD_COMMAND }, {
      onSuccess: () => notify(`Opening Kiro's session dashboard in a new terminal. ${hint}`, 'success'),
      onError: (e) => notify(errorMessage(e), 'error'),
    }),
  };
}
