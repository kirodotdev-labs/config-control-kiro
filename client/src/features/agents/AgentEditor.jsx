/**
 * @fileoverview Edits one agent: the form on the left, the spec's JSON on the
 * right, kept in sync. Save writes the complete spec (the server keeps key
 * order and the file's format); Terminal starts a V3 chat with this agent.
 */
import { useQueryClient } from '@tanstack/react-query';
import { runningChatsFor } from '../../data/useSessions';
import { useCallback, useState } from 'react';
import { Button, Chip } from '@mui/material';
import { DeleteOutlined, SmartToy } from '@mui/icons-material';
import { useAgentMutations, useAgentSpec, useAgentSummaries } from '../../data/useAgents';
import { errorMessage } from '../../data/errors';
import { editsGeneratedV3 } from '../../domain/v2.js';
import useJsonDocument from '../../hooks/useJsonDocument';
import { useEditorGuard } from '../../contexts/UnsavedChangesContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { isObject } from '../../domain/json.js';
import { EditorFrame, EditStatus, SaveButton } from '../../ui/EditorFrame';
import { CodeEditor } from '../../ui/CodeEditor';
import { SplitPane } from '../../ui/SplitPane';
import { Loading, ErrorState } from '../../ui/States';
import { useNotify } from '../../ui/NotifyProvider';
import { useConfirm } from '../../ui/ConfirmProvider';
import { TerminalButton } from '../launcher/TerminalButton';
import { AgentForm } from './AgentForm';
import { SECTION_FIELDS, sectionForKey } from '../../domain/agentKeys.js';

const validate = (v) => (isObject(v) ? '' : 'An agent spec must be a JSON object');

/** @param {{id: string, onDeleted: () => void, onOpenKind?: (kind: string) => void}} props */
export function AgentEditor({ id, onDeleted, onOpenKind }) {
  const query = useAgentSpec(id);
  if (query.isLoading) return <Loading label={`Loading ${id}…`} />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={query.refetch} />;
  return <AgentEditorBody key={id} id={id} loaded={query.data} onDeleted={onDeleted} onOpenKind={onOpenKind} />;
}

function AgentEditorBody({ id, loaded, onDeleted, onOpenKind }) {
  const { configPath } = useWorkspace();
  const { save, remove } = useAgentMutations();
  const summary = useAgentSummaries().data?.find((a) => a.id === id);
  const format = summary?.format || 'json';
  const notify = useNotify();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [active, setActive] = useState('identity');
  const [reveal, setReveal] = useState({ id: '', n: 0 }); // which card the JSON cursor asked to open
  const [present, setPresent] = useState([]); // section ids the form renders
  const { doc: spec, setDoc, text, setText, error, dirty, markSaved } = useJsonDocument(loaded, id, validate);
  const name = typeof spec.name === 'string' && spec.name ? spec.name : id;

  const onSave = useCallback(async () => {
    // 2.x: editing what Kiro generated for an upgraded agent stops Kiro updating it.
    if (summary?.v3?.universal && summary.v3.kiro !== 'out-of-sync' && editsGeneratedV3(loaded, spec) && !await confirm({
      title: 'Save and stop Kiro updating the V3 settings?', confirmLabel: 'Save',
      body: `Kiro upgraded ${name} and keeps its V3 settings (tools, permissions, hooks) in step with the 2.x ones. Changing them here marks the agent Out of sync: Kiro stops updating them, and 2.x and V3 chats can behave differently. To keep it in step, change the 2.x settings in the JSON instead and let Kiro refresh the V3 ones.`,
    })) return;
    save.mutate({ id, spec }, {
      onSuccess: (saved) => {
        markSaved(saved);
        const open = runningChatsFor(qc, [id, name]);
        notify(open ? `${name} saved. ${open} running chat${open > 1 ? 's' : ''} still use the old version until quit and resumed.` : `${name} saved. New chats use it.`, open ? 'info' : 'success');
      },
      onError: (e) => notify(errorMessage(e), 'error'),
    });
  }, [save, id, spec, name, markSaved, notify, qc, summary, loaded, confirm]);
  useEditorGuard({ dirty, canSave: dirty && !error && !save.isPending, onSave });

  const onDelete = async () => {
    if (!await confirm({ title: `Delete ${name}?`, body: `${id}.${format} will be deleted from disk. This can't be undone.`, confirmLabel: 'Delete', danger: true })) return;
    remove.mutate(id, {
      onSuccess: () => { markSaved(spec); notify(`${name} deleted`, 'success'); onDeleted(); },
      onError: (e) => notify(errorMessage(e), 'error'),
    });
  };

  // Card → JSON: every key the card edits; a key clicked under "Also in this file" → itself.
  const highlightKeys = active.startsWith('key:') ? [active.slice(4)] : (SECTION_FIELDS[active] || []).filter((f) => f in spec);
  // JSON → card: the cursor's top-level key opens the card that edits it.
  const onCursorKey = useCallback(([key]) => {
    if (!key) return;
    const section = sectionForKey(key, present) || `key:${key}`;
    setActive(section);
    if (!section.startsWith('key:')) setReveal((r) => ({ id: section, n: r.n + 1 }));
  }, [present]);
  return (
    <EditorFrame
      icon={<SmartToy />} title={name} path={`${configPath}/agents/${id}.${format}`}
      status={<>
        <EditStatus dirty={dirty} error={error} />
        {summary?.overridesGlobal && <Chip size="small" variant="outlined" label="overrides a Global agent" title="A Global agent has the same name. Kiro uses this one in this workspace." />}
      </>}
      actions={<>
        <Button color="inherit" startIcon={<DeleteOutlined />} onClick={onDelete} disabled={remove.isPending}>Delete</Button>
        <SaveButton dirty={dirty} valid={!error} saving={save.isPending} onClick={onSave} />
        <TerminalButton agentId={name} v3={summary?.v3} disabledReason={dirty ? 'Save your changes first. Kiro reads the agent from the saved file.' : ''} />
      </>}
    >
      <SplitPane
        persistKey="agent-editor"
        left={<AgentForm id={id} format={format} spec={spec} onChange={setDoc} active={active} onActivate={setActive} reveal={reveal} onSections={setPresent} v3={summary?.v3} dirty={dirty} onOpenKind={onOpenKind} />}
        right={<CodeEditor value={text} onChange={setText} highlightKeys={highlightKeys} onCursorKey={onCursorKey} />}
      />
    </EditorFrame>
  );
}
