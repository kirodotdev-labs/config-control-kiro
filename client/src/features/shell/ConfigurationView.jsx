/**
 * @fileoverview The Configuration banner: the scope navigator on the left and
 * the selected surface's editor on the right.
 */
import { useState } from 'react';
import { Box } from '@mui/material';
import { useConfirmLeave } from '../../contexts/UnsavedChangesContext';
import { useAgentSummaries } from '../../data/useAgents';
import { useSurfaces } from '../../data/useSystem';
import ErrorBoundary from '../../ui/ErrorBoundary';
import { NewAgentDialog } from '../agents/NewAgentDialog';
import { NewFileDialog } from './NewFileDialog';
import { AddSkillFileDialog } from '../skills/AddSkillFileDialog';
import { parentOf } from '../files/paths';
import { ScopeNavigator } from './ScopeNavigator';
import { EditorRouter } from './EditorRouter';

const agentNode = (id) => ({ kind: 'agent', id: `agent:${id}`, name: id });

export function ConfigurationView() {
  const [selected, setSelected] = useState(null);
  const [newAgent, setNewAgent] = useState(false);
  const [createIn, setCreateIn] = useState(null); // the group a new file is being created in
  const [addFileTo, setAddFileTo] = useState(null); // the skill a file is being added to
  // "+" on a group opens New …; on a skill (id skill:<name>) it adds a file to that skill.
  const create = (node) => (node.id?.startsWith('skill:') ? setAddFileTo({ name: node.name, dir: parentOf(node.path) }) : setCreateIn(node));
  const confirmLeave = useConfirmLeave();
  const ids = (useAgentSummaries().data || []).map((a) => a.id);
  const openAgent = async (id) => { if (await confirmLeave()) setSelected(agentNode(id)); };
  const nodes = useSurfaces().data?.nodes;
  const openKind = async (kind) => {
    const node = nodes?.find((n) => n.kind === kind);
    if (node && await confirmLeave()) setSelected(node);
  };

  return (
    <Box sx={{ height: '100%', minHeight: 0, display: 'flex' }}>
      <ScopeNavigator selected={selected} onSelect={setSelected} onNewAgent={() => setNewAgent(true)} onCreate={create} />
      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <ErrorBoundary resetKeys={[selected?.id]}>
          <EditorRouter node={selected} onOpenAgent={openAgent} onOpenKind={openKind} onClose={() => setSelected(null)} onCreate={create} onOpenNode={async (n) => { if (await confirmLeave()) setSelected(n); }} />
        </ErrorBoundary>
      </Box>
      <AddSkillFileDialog skill={addFileTo} onClose={() => setAddFileTo(null)} onCreated={(node) => { setAddFileTo(null); setSelected(node); }} />
      <NewFileDialog group={createIn} onClose={() => setCreateIn(null)}
        onCreated={(node) => { setCreateIn(null); setSelected(node); }} />
      <NewAgentDialog open={newAgent} onClose={() => setNewAgent(false)} existingIds={ids}
        onCreated={(id) => { setNewAgent(false); openAgent(id); }} />
    </Box>
  );
}
