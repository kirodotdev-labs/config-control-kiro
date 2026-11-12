/**
 * @fileoverview All agents in the active scope, as a list, with
 * "New agent". Opening an agent hands its id to the navigator.
 */
import { useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { Add, SmartToy } from '@mui/icons-material';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useAgentSummaries } from '../../data/useAgents';
import { errorMessage } from '../../data/errors';
import { EmptyState, ErrorState, Loading } from '../../ui/States';
import { AgentList } from './AgentList';
import { NewAgentDialog } from './NewAgentDialog';
import { UpgradeAllBanner } from '../v2/UpgradeAllBanner';
import { BuiltinAgents } from './BuiltinAgents';

/** @param {{onOpenAgent: (id: string) => void}} props */
export function AgentsOverview({ onOpenAgent }) {
  const { isWorkspaceMode } = useWorkspace();
  const query = useAgentSummaries();
  const [creating, setCreating] = useState(false);
  const agents = query.data || [];
  const scope = isWorkspaceMode ? 'this workspace' : 'Global';

  let body;
  if (query.isLoading) body = <Loading />;
  else if (query.isError) body = <ErrorState message={errorMessage(query.error)} onRetry={query.refetch} />;
  else if (!agents.length) {
    body = (
      <EmptyState icon={<SmartToy color="disabled" sx={{ fontSize: 48 }} />} title={`No agents in ${scope} yet`}
        body="A custom agent shapes how Kiro works: its prompt, model, tools and permissions."
        action={<Button variant="contained" startIcon={<Add />} onClick={() => setCreating(true)}>Create your first agent</Button>} />
    );
  } else body = <AgentList agents={agents} onOpen={onOpenAgent} />;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 3, gap: 2 }}>
      <Stack sx={{ alignItems: "center", justifyContent: "space-between" }} direction="row">
        <Box>
          <Typography variant="h5">Agents</Typography>
          <Typography variant="body2" color="text.secondary">{agents.length} in {scope}</Typography>
        </Box>
        <Stack sx={{ alignItems: "center" }} direction="row" spacing={2}>
          <Button variant="contained" startIcon={<Add />} onClick={() => setCreating(true)}>New agent</Button>
        </Stack>
      </Stack>
      {/* 2.x: remove with V2 support */}
      {!!agents.length && <UpgradeAllBanner agents={agents} scopeLabel={scope} />}
      <BuiltinAgents />
      <Box sx={{ flexGrow: 1, minHeight: 0 }}>{body}</Box>
      <NewAgentDialog open={creating} onClose={() => setCreating(false)} existingIds={agents.map((a) => a.id)}
        onCreated={(id) => { setCreating(false); onOpenAgent(id); }} />
    </Box>
  );
}
