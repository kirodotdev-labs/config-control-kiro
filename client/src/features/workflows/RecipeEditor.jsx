/**
 * @fileoverview Edits one workflow recipe in three panes: the recipe as a
 * graph (add nodes with + on the arrows, select one to edit it), the selected
 * node's fields (or the recipe's own, with how to run it), and the file,
 * all kept in sync. Problems Kiro would report show on the nodes.
 */
import { useCallback, useState } from 'react';
import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material';
import { AccountTree, ContentCopy } from '@mui/icons-material';
import { useFileText, useSaveFile } from '../../data/useFiles';
import { useAllAgentIds } from '../../data/useAgents';
import { errorMessage } from '../../data/errors';
import useTextDocument from '../../hooks/useTextDocument';
import { useEditorGuard } from '../../contexts/UnsavedChangesContext';
import {
  addNode, checkRecipe, getAt, INPUT_HINTS, insertNode, moveNode, newNode, readRecipe, removeNode, runCommand, setAt, validatePrompt, walkNodes, writeRecipe,
} from '../../domain/workflows.js';
import { EditorFrame, EditStatus, SaveButton } from '../../ui/EditorFrame';
import { CodeEditor } from '../../ui/CodeEditor';
import { SplitPane } from '../../ui/SplitPane';
import { KeyValueInput } from '../../ui/KeyValueInput';
import { Loading, ErrorState } from '../../ui/States';
import { useNotify } from '../../ui/NotifyProvider';
import { SURFACE } from '../../theme';
import { DeleteFileButton } from '../files/DeleteFileButton';
import { baseName } from '../files/paths';
import { TerminalButton } from '../launcher/TerminalButton';
import { WorkflowsSwitch } from './WorkflowsSwitch';
import { NodeCard } from './NodeCard';
import { WorkflowGraph } from './WorkflowGraph';
import { ModelEffort } from './fields';

const formatOf = (path) => (/\.ya?ml$/i.test(path) ? 'yaml' : 'json');
const samePath = (a, b) => a.length === b.length && a.every((k, i) => k === b[i]);

/**
 * @param {Object} props
 * @param {string} props.path
 * @param {{path: string, label: string}} props.deletable
 * @param {() => void} props.onDeleted
 */
export function RecipeEditor({ path, deletable, onDeleted }) {
  const file = useFileText(path);
  if (file.isLoading) return <Loading />;
  if (file.isError) return <ErrorState message={errorMessage(file.error)} onRetry={file.refetch} />;
  return <RecipeBody key={path} path={path} loaded={file.data.content} deletable={deletable} onDeleted={onDeleted} />;
}

function RecipeBody({ path, loaded, deletable, onDeleted }) {
  const format = formatOf(path);
  const read = useCallback((t) => readRecipe(t, format), [format]);
  const write = useCallback((t, v) => writeRecipe(t, format, v), [format]);
  const { text, setText, value, setValue, error, dirty, markSaved } = useTextDocument(loaded, path, read, write);
  const recipe = value || {};
  const { data: agents = [] } = useAllAgentIds();
  const problems = value ? checkRecipe(recipe, { agents }) : [];
  const errors = problems.filter((p) => p.severity === 'error');
  const save = useSaveFile();
  const notify = useNotify();
  const [focus, setFocus] = useState([]); // the node the JSON pane shows

  const onSave = useCallback(() => {
    save.mutate({ path, content: text }, {
      onSuccess: () => { markSaved(text); notify('Recipe saved. Run it with /workflow run in a new chat.', 'success'); },
      onError: (e) => notify(errorMessage(e), 'error'),
    });
  }, [save, path, text, markSaved, notify]);
  useEditorGuard({ dirty, canSave: dirty && !error && !save.isPending, onSave });

  const set = (p, v) => setValue(setAt(recipe, p, v));
  const nodes = walkNodes(recipe);
  const copy = async (t) => { await navigator.clipboard.writeText(t); notify('Copied', 'success'); };
  // JSON cursor → the innermost node under it.
  const onCursorKey = useCallback((keys) => {
    for (let n = keys.length; n > 1; n -= 1) {
      const p = keys.slice(0, n);
      if (typeof p[p.length - 1] === 'number' && ['steps', 'branches'].includes(p[p.length - 2])) { setFocus(p); return; }
    }
  }, []);

  const inputs = recipe.inputs && typeof recipe.inputs === 'object' ? recipe.inputs : {};
  const selectedNode = focus.length ? getAt(recipe, focus) : null;
  const errorsAt = (p) => problems.filter((x) => x.severity === 'error' && samePath(x.path, p)).length;

  // The details pane: the selected node, or the recipe itself when nothing is selected.
  const details = selectedNode ? (
    <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Button size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => setFocus([])}>← The recipe</Button>
      <NodeCard recipe={recipe} path={focus} node={selectedNode} depth={0}
        problems={problems.filter((x) => samePath(x.path, focus))}
        onField={(k, v) => {
          const next = setAt(recipe, [...focus, k], v);
          setValue(next);
        }}
        onMove={(d) => { setValue(moveNode(recipe, focus, d)); setFocus([...focus.slice(0, -1), focus[focus.length - 1] + d]); }}
        onRemove={() => { setValue(removeNode(recipe, focus)); setFocus([]); }}
        onAddInside={(type) => {
          const list = [...focus, selectedNode.type === 'parallel' ? 'branches' : 'steps'];
          setValue(addNode(recipe, list, newNode(recipe, type)));
          setFocus([...list, (getAt(recipe, list) || []).length]);
        }}
        first={focus[focus.length - 1] === 0} last={focus[focus.length - 1] === (getAt(recipe, focus.slice(0, -1)) || []).length - 1}
        active={false} onFocus={() => {}} />
    </Box>
  ) : (
    <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${SURFACE.border}` }} data-section="run">
        <Typography variant="overline" color="text.secondary">Run it</Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
          <Typography variant="body2">In a V3 chat: <Box component="code" sx={{ fontWeight: 700 }}>{runCommand(recipe)}</Box></Typography>
          <Button size="small" startIcon={<ContentCopy />} onClick={() => copy(runCommand(recipe))}>Copy</Button>
          <TerminalButton size="small" title={`Run ${recipe.name || 'this recipe'} in Kiro CLI V3`}
            hint={<>In the chat, type <code>{runCommand(recipe)}</code>. Kiro asks for its inputs and shows the plan before any step runs.</>}
            disabledReason={dirty ? 'Save your changes first: Kiro reads the saved recipe.' : ''} />
        </Stack>
        <Typography variant="caption" color="text.secondary" component="div">
          {Object.keys(inputs).length ? `Kiro asks for ${Object.keys(inputs).join(', ')} and shows the plan for your approval before any step runs.` : 'Kiro shows the plan for your approval before any step runs.'}
          {' '}To check it the way Kiro will, ask it in a chat: <Box component="code">{validatePrompt(path)}</Box>
          <Button size="small" startIcon={<ContentCopy />} onClick={() => copy(validatePrompt(path))} sx={{ ml: 0.5 }}>Copy</Button>
        </Typography>
      </Box>
      <Box sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${SURFACE.border}`, display: 'flex', flexDirection: 'column', gap: 1.25 }} data-section="recipe">
        <TextField size="small" label="Name" value={recipe.name || ''} onChange={(e) => set(['name'], e.target.value)}
          helperText="What /workflow run lists" slotProps={{ input: { sx: { fontFamily: 'monospace' } } }} />
        <TextField size="small" label="Description" value={recipe.description || ''} onChange={(e) => set(['description'], e.target.value || undefined)}
          helperText="Shown in the recipe picker" multiline maxRows={4} />
        <KeyValueInput label="Asks for (inputs)" keyLabel="Name" value={inputs} onChange={(v) => set(['inputs'], Object.keys(v).length ? v : undefined)}
          hint={`Values you give at launch; use them in prompts as {{name}}. The type is a hint for the form: ${INPUT_HINTS.join(', ')}.`} />
        <ModelEffort node={recipe} onChange={(k, v) => set([k], v)} inherit="the chat's model" />
        {problems.filter((p) => !p.path.length).map((p) => <Alert key={p.message} severity={p.severity === 'error' ? 'error' : 'warning'} variant="outlined" sx={{ py: 0 }}>{p.message}</Alert>)}
      </Box>
      <Typography variant="caption" color="text.secondary">Select a node in the graph to edit it. The + on an arrow adds a node there.</Typography>
    </Box>
  );

  const left = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Box sx={{ px: 1.5, pt: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <WorkflowsSwitch compact />
        {error && <Alert severity="error" variant="outlined">The file has a problem, so the form shows the last good version: {error}</Alert>}
        <Typography variant="overline" color="text.secondary">
          {nodes.filter((x) => x.node?.type === 'step').length} of 50 steps{errors.length ? ` · ${errors.length} to fix before it runs` : ''}
        </Typography>
      </Box>
      <Box sx={{ flexGrow: 1, minHeight: 0, display: 'flex' }}>
        <Box sx={{ flex: '1 1 55%', minWidth: 0, overflow: 'auto' }}>
          <WorkflowGraph recipe={recipe} selected={focus} onSelect={setFocus} errorsAt={errorsAt}
            onInsert={(listPath, index, type) => { setValue(insertNode(recipe, listPath, index, newNode(recipe, type))); setFocus([...listPath, index]); }} />
        </Box>
        <Box sx={{ flex: '1 1 45%', minWidth: 300, maxWidth: 520, overflow: 'auto', borderLeft: `1px solid ${SURFACE.border}` }} data-section="details">
          {details}
        </Box>
      </Box>
    </Box>
  );

  return (
    <EditorFrame
      icon={<AccountTree />} title={recipe.name || baseName(path)} path={path}
      status={<EditStatus dirty={dirty} error={error} />}
      actions={<>
        <DeleteFileButton target={deletable} onDeleted={onDeleted} beforeDelete={() => markSaved(text)} />
        <SaveButton dirty={dirty} valid={!error} saving={save.isPending} onClick={onSave} />
      </>}
    >
      <SplitPane persistKey="recipe-editor" initial={66} left={left}
        right={<CodeEditor value={text} onChange={setText} language={format} highlightKey={format === 'json' && focus.length ? focus : ''} onCursorKey={format === 'json' ? onCursorKey : undefined} cursorDepth={20} />} />
    </EditorFrame>
  );
}

