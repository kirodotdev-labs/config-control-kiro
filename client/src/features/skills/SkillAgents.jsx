/**
 * @fileoverview One line: which agents can use a skill. By default every
 * custom agent inherits the skills in this folder (configuration reference,
 * "Disabling default resource inheritance"); with that turned off, only agents
 * whose Context lists it (a skill:// resource) see it.
 */
import { useState } from 'react';
import { Box, Button, Chip, Menu, MenuItem, Stack, Typography } from '@mui/material';
import { Add } from '@mui/icons-material';
import { useRelations } from '../../data/useRelations';
import { useAgentMutations, useAgentSummaries } from '../../data/useAgents';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { agentApi } from '../../services/api';
import { errorMessage } from '../../data/errors';
import { scopeUris } from '../../domain/context.js';
import { useNotify } from '../../ui/NotifyProvider';
import { SURFACE } from '../../theme';

/**
 * @param {Object} props
 * @param {string} props.name the skill's folder name.
 * @param {(id: string) => void} [props.onOpenAgent]
 */
export function SkillAgents({ name, onOpenAgent }) {
  const { isWorkspaceMode } = useWorkspace();
  const relations = useRelations({ id: `skill:${name}`, kind: 'file' });
  const agents = useAgentSummaries().data || [];
  const { save } = useAgentMutations();
  const notify = useNotify();
  const [menu, setMenu] = useState(null);
  const links = relations.data?.links || [];
  const everyAgent = links.some((l) => l.id === 'agents');
  const using = links.filter((l) => l.id.startsWith('agent:')).map((l) => l.id.slice(6));
  const others = agents.map((a) => a.id).filter((id) => !using.includes(id));

  const addTo = async (id) => {
    setMenu(null);
    try {
      const spec = await agentApi.get(id);
      const resources = Array.isArray(spec.resources) ? spec.resources : [];
      await save.mutateAsync({ id, spec: { ...spec, resources: [...resources, scopeUris(isWorkspaceMode).skill(name)] } });
      notify(`${id} lists ${name} in its Context`, 'success');
      relations.refetch();
    } catch (e) {
      notify(errorMessage(e), 'error');
    }
  };

  return (
    <Stack direction="row" spacing={1} sx={{ px: 2, py: 1, alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5, borderBottom: `1px solid ${SURFACE.border}` }} data-section="skill-agents">
      <Typography variant="body2" color="text.secondary">Used by</Typography>
      {everyAgent && <Chip size="small" variant="outlined" label="every agent" title="Custom agents inherit the skills in this folder unless chat.disableInheritingDefaultResources is on" />}
      {using.map((id) => <Chip key={id} size="small" label={id} onClick={onOpenAgent && (() => onOpenAgent(id))} title="Listed in this agent's Context" />)}
      {!relations.isLoading && !everyAgent && !using.length && <Typography variant="body2" color="warning.main">no agent (inheriting default resources is off)</Typography>}
      {others.length > 0 && <Button size="small" startIcon={<Add />} onClick={(e) => setMenu(e.currentTarget)}>Add to an agent&apos;s Context</Button>}
      <Menu open={!!menu} anchorEl={menu} onClose={() => setMenu(null)}>
        {others.map((id) => <MenuItem key={id} onClick={() => addTo(id)}>{id}</MenuItem>)}
      </Menu>
      <Box sx={{ flexGrow: 1 }} />
    </Stack>
  );
}
