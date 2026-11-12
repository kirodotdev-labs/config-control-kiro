/**
 * @fileoverview Chats & usage: every Kiro CLI chat (as Kiro lists them) and
 * the credits they used. In a Workspace it shows that workspace's chats.
 * Read-only: nothing here changes Kiro's files.
 */
import { useMemo, useState } from 'react';
import { Alert, Box, Button, Stack, Tab, Tabs, Typography } from '@mui/material';
import { Cloud, Insights, Refresh } from '@mui/icons-material';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useKiroStatus, kiroBlocker } from '../../data/useKiro';
import { useRefreshSessions, useSessions } from '../../data/useSessions';
import { useAllAgentIds } from '../../data/useAgents';
import { errorMessage } from '../../data/errors';
import { timeAgo } from '../../domain/sessions.js';
import { EditorFrame } from '../../ui/EditorFrame';
import { ErrorState, Loading } from '../../ui/States';
import { ChatList } from './ChatList';
import { UsageView } from './UsageView';
import { LaunchDialog } from '../launcher/LaunchDialog';

/** @param {{path: string, onOpenAgent?: (id: string) => void}} props */
export function SessionsView({ path, onOpenAgent }) {
  const ws = useWorkspace();
  const folder = ws.isWorkspaceMode ? ws.activeWorkspace : '';
  const { data: status } = useKiroStatus();
  const blocker = kiroBlocker(status, 'sessions');
  const query = useSessions(folder, { enabled: !!status && !blocker, live: true });
  const refresh = useRefreshSessions(folder);
  const { data: ids = [] } = useAllAgentIds();
  const agentIds = useMemo(() => new Set(ids), [ids]);
  const [tab, setTab] = useState('chats');
  const [cloud, setCloud] = useState(false);
  const data = query.data;
  const where = folder ? 'started in this workspace' : 'on this computer';

  const body = () => {
    if (blocker) return <Alert severity="warning">{blocker}</Alert>;
    if (query.isLoading) return <Loading label="Asking Kiro CLI for your chats… this takes a few seconds." />;
    if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={query.refetch} />;
    // V3 chats are read from Kiro's V3 store; a problem only means the 2.x chats couldn't be listed.
    const problem = data.problem && (
      <Alert severity="warning" action={<Button color="inherit" onClick={() => refresh.mutate()}>Try again</Button>}>
        {data.sessions.length ? 'Your V3 chats are listed below, but Kiro CLI couldn\'t list its 2.x chats. ' : ''}{data.problem.message} {data.problem.fix}
      </Alert>
    );
    if (problem && !data.sessions.length) return problem;
    const props = { sessions: data.sessions, workspaces: ws.workspaces, global: !folder, agentIds, onOpenAgent };
    return <>{problem}{tab === 'chats' ? <ChatList {...props} /> : <UsageView {...props} usage={data.usage} />}</>;
  };

  return (
    <EditorFrame icon={<Insights />} title="Chats & usage" path={path}
      status={data?.checked ? <Typography variant="caption" color="text.secondary">Updated {timeAgo(data.checked)}</Typography> : null}
      actions={(
        <>
          <Button startIcon={<Cloud />} onClick={() => setCloud(true)}>Start cloud session</Button>
          <Button startIcon={<Refresh />} disabled={!!blocker || refresh.isPending} onClick={() => refresh.mutate()}>
            {refresh.isPending ? 'Refreshing…' : 'Refresh'}
          </Button>
        </>
      )}>
      <Box sx={{ overflow: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Every Kiro CLI chat {where}, newest first: V3 chats from Kiro&apos;s V3 store, and 2.x and classic chats as Kiro CLI lists them.
          Resume opens a chat in a new terminal. Context and credits come from the details Kiro saves with each chat; the app never reads
          what was said, and nothing here changes your chats. Cloud sessions run in a Kiro sandbox and are kept in your Kiro account, not on
          this computer: open them with kiro-cli chat --v3 --sessions, or resume one with kiro-cli chat --resume-id &lt;id&gt;.
        </Typography>
        <Stack direction="row">
          <Tabs value={tab} onChange={(_, v) => setTab(v)}>
            <Tab value="chats" label="Chats" />
            <Tab value="usage" label="Usage" />
          </Tabs>
        </Stack>
        {body()}
      </Box>
      <LaunchDialog open={cloud} onClose={() => setCloud(false)} cloud title="Start a cloud session" />
    </EditorFrame>
  );
}
