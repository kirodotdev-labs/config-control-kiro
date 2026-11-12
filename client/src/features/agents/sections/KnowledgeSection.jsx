/**
 * @fileoverview The agent's knowledge bases: folders Kiro indexes so the
 * agent can search them. Never loaded into the chat, unlike Context. They
 * are the knowledgeBase entries of `resources`; this section changes only
 * those, and the Context section only the rest.
 */
import { useState } from 'react';
import { Alert, Box, Button, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { Add, Delete, Edit } from '@mui/icons-material';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import { useChatDefaults } from '../../../data/useKnowledge';
import { errorMessage } from '../../../data/errors';
import { setField } from '../../../domain/json.js';
import { canSearchKnowledge, describeEntry, isKnowledgeBase } from '../../../domain/knowledge.js';
import { useNotify } from '../../../ui/NotifyProvider';
import { KnowledgeBaseDialog } from './KnowledgeBaseDialog';

/** @param {{id: string, spec: Object, onChange: (next: Object) => void}} props */
export function KnowledgeSection({ id, spec, onChange }) {
  const { isWorkspaceMode } = useWorkspace();
  const defaults = useChatDefaults();
  const notify = useNotify();
  const [editing, setEditing] = useState(undefined); // undefined: closed; null: new; number: index in resources
  const resources = Array.isArray(spec.resources) ? spec.resources : [];
  const bases = resources.map((r, i) => ({ r, i })).filter(({ r }) => isKnowledgeBase(r));
  const tools = Array.isArray(spec.tools) ? spec.tools : [];
  const setResources = (next) => onChange(setField(spec, 'resources', next));

  const save = (entry) => setResources(typeof editing === 'number'
    ? resources.map((r, i) => (i === editing ? entry : r)) : [...resources, entry]);
  const makeDefault = () => defaults.setDefaultAgent(id, {
    onSuccess: () => notify(`New ${isWorkspaceMode ? 'chats in this workspace' : 'chats'} now start with ${id}.`, 'success'),
    onError: (e) => notify(errorMessage(e), 'error'),
  });
  const isDefault = defaults.defaultAgent.agent === id;

  return (
    <Stack spacing={1.5}>
      <Typography variant="body2" color="text.secondary">
        A knowledge base is a folder Kiro indexes on this computer. The agent searches it when it needs to, and only the passages it finds are
        sent to the model, so it suits large material such as documentation or a codebase. Rules the agent must always follow belong in steering.
      </Typography>
      {bases.map(({ r, i }) => (
        <Stack key={i} direction="row" spacing={1} sx={{ alignItems: 'center' }} data-testid="kb-row">
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{r.name || 'Unnamed knowledge base'}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontFamily: 'monospace' }} noWrap title={describeEntry(r)}>
              {describeEntry(r)}
            </Typography>
          </Box>
          <Tooltip title="Edit"><IconButton size="small" aria-label={`Edit knowledge base ${r.name || ''}`} onClick={() => setEditing(i)}><Edit fontSize="small" /></IconButton></Tooltip>
          <Tooltip title="Remove"><IconButton size="small" aria-label={`Remove knowledge base ${r.name || ''}`}
            onClick={() => setResources(resources.filter((_, j) => j !== i))}><Delete fontSize="small" /></IconButton></Tooltip>
        </Stack>
      ))}
      {!bases.length && <Typography variant="body2" color="text.secondary">No knowledge bases yet.</Typography>}
      <Box><Button size="small" startIcon={<Add />} onClick={() => setEditing(null)}>Knowledge base</Button></Box>

      {bases.length > 0 && !canSearchKnowledge(tools) && (
        <Alert severity="warning" data-testid="kb-no-tool"
          action={<Button color="inherit" size="small" onClick={() => onChange(setField(spec, 'tools', [...tools, 'knowledge']))}>Add the tool</Button>}>
          This agent can&apos;t search its knowledge bases: its tools don&apos;t include knowledge. The read, write, shell and web groups
          don&apos;t cover it.
        </Alert>
      )}
      {bases.length > 0 && defaults.ready && !defaults.knowledgeOn && (
        <Alert severity="warning" data-testid="kb-off">
          Knowledge is switched off in Settings (chat.enableKnowledge), so Kiro won&apos;t index or search these. Turn it on under Settings → Chat.
        </Alert>
      )}
      {bases.length > 0 && defaults.ready && !isDefault && (
        <Alert severity="info" variant="outlined" data-testid="kb-default"
          action={<Button color="inherit" size="small" disabled={defaults.saving} onClick={makeDefault}>Make this the default agent</Button>}>
          New {isWorkspaceMode ? 'chats in this workspace' : 'chats'} start with {defaults.defaultAgent.agent}, so they won&apos;t have these
          knowledge bases unless you pick this agent (/agent in a chat, or the Terminal button).
        </Alert>
      )}

      <KnowledgeBaseDialog open={editing !== undefined} entry={typeof editing === 'number' ? resources[editing] : null}
        others={bases.filter(({ i }) => i !== editing).map(({ r }) => r)}
        onClose={() => setEditing(undefined)} onSave={save} />
    </Stack>
  );
}
