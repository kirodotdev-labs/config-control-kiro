/**
 * @fileoverview An agent's own chats, newest first: the same rows as the
 * Chats & usage page, with a link to it for everything else.
 */
import { useMemo } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useAllAgentIds } from '../../data/useAgents';
import { childrenByParent, tagCounts } from '../../domain/sessions.js';
import { ChatRow } from './ChatRow';
import { useDeleteChat } from './useDeleteChat';
import { useResume } from './useResume';

const SHOWN = 5;

/**
 * @param {Object} props
 * @param {Object[]} props.sessions every chat (from useSessions).
 * @param {string[]} props.names the agent's id and name field.
 * @param {() => void} [props.onOpenChats] open the Chats & usage page.
 */
export function AgentChats({ sessions, names, onOpenChats }) {
  const ws = useWorkspace();
  const { data: ids = [] } = useAllAgentIds();
  const agentIds = useMemo(() => new Set(ids), [ids]);
  const children = useMemo(() => childrenByParent(sessions), [sessions]);
  const known = useMemo(() => tagCounts(sessions).map((t) => t.tag), [sessions]);
  const resumer = useResume();
  const { onDelete, deleting } = useDeleteChat(children);
  const mine = sessions.filter((s) => !s.parentId && !s.empty && names.includes(s.agent));
  if (!mine.length) return <Typography variant="body2" color="text.secondary">No chats with this agent yet.</Typography>;
  return (
    <Box>
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
        {mine.slice(0, SHOWN).map((c) => (
          <ChatRow key={c.id} chat={c} workspaces={ws.workspaces} resumer={resumer} agentIds={agentIds}
            knownTags={known} onPickTag={() => onOpenChats?.()} childCount={(children.get(c.id) || []).length}
            onDelete={onDelete} deleting={deleting} />
        ))}
      </Box>
      {onOpenChats && (
        <Button size="small" sx={{ mt: 0.5 }} onClick={onOpenChats}>
          {mine.length > SHOWN ? `All ${mine.length} chats in Chats & usage` : 'Open Chats & usage'}
        </Button>
      )}
    </Box>
  );
}
