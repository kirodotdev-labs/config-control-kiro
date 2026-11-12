/**
 * @fileoverview One workflow run, read only: the plan it ran as a graph with
 * each node coloured by how far it got, the selected step's outcome (status,
 * timing, what it said, the files it wrote), and how to act on the run in
 * Kiro (reopen its chat, the /workflow commands with this run's id, save the
 * plan as a recipe). Kiro owns the run; the app never changes it.
 */
import { useState } from 'react';
import { Alert, Box, Button, Chip, Stack, Tooltip, Typography } from '@mui/material';
import { ContentCopy, Description, History, Save, Terminal } from '@mui/icons-material';
import { useWorkflowRun } from '../../data/useWorkflowRuns';
import { useSaveFile } from '../../data/useFiles';
import { useSurfaces } from '../../data/useSystem';
import { errorMessage } from '../../data/errors';
import { RUN_STATUS, runStatusById, getAt } from '../../domain/workflows.js';
import { timeAgo } from '../../domain/sessions.js';
import { EditorFrame } from '../../ui/EditorFrame';
import { Loading, ErrorState } from '../../ui/States';
import { useNotify } from '../../ui/NotifyProvider';
import { SURFACE } from '../../theme';
import { useResume } from '../sessions/useResume';
import { baseName } from '../files/paths';
import { WorkflowGraph } from './WorkflowGraph';

const BOX = { p: 1.5, borderRadius: 2, border: `1px solid ${SURFACE.border}` };

/** "1 min 42 s" between two ISO times (or until now). */
function took(start, end) {
  if (!start) return '';
  const s = Math.max(0, Math.round(((end ? Date.parse(end) : Date.now()) - Date.parse(start)) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

/** A status chip for a run or node. */
export function RunStatus({ status, awaiting }) {
  const info = RUN_STATUS[status] || { label: status || '?', color: 'text.secondary' };
  return <Chip size="small" variant="outlined" label={awaiting ? 'needs you' : info.label} sx={{ color: awaiting ? 'warning.main' : info.color, borderColor: 'currentColor' }} />;
}

/**
 * @param {Object} props
 * @param {string} props.id the workflow id.
 * @param {(node: Object) => void} props.onOpenNode open a file or a recipe in the editor.
 */
export function RunView({ id, onOpenNode }) {
  const run = useWorkflowRun(id);
  const [selected, setSelected] = useState([]);
  const resume = useResume();
  const notify = useNotify();
  const save = useSaveFile();
  const workflows = useSurfaces().data?.nodes?.find((n) => n.kind === 'workflows');
  if (run.isLoading) return <Loading />;
  if (run.isError) return <ErrorState message={errorMessage(run.error)} onRetry={run.refetch} />;
  const r = run.data;
  const plan = r.definition && typeof r.definition === 'object' ? r.definition : null; // the recipe as it ran
  const status = runStatusById(r.root);
  const node = selected.length && plan ? getAt(plan, selected) : null;
  const ns = node ? status[node.id] : null;
  const copy = async (t) => { await navigator.clipboard.writeText(t); notify('Copied', 'success'); };
  const openFile = (path, name) => onOpenNode({ kind: 'file', id: `wffile:${path}`, name: name || baseName(path), path });
  const live = r.status === 'running' || r.status === 'paused';
  const commands = [
    ['status', 'print its status'],
    ...(r.status === 'running' ? [['pause', 'pause at the next safe point']] : []),
    ...(r.status === 'paused' ? [['resume', 'resume it']] : []),
    ...(live ? [['cancel', 'stop it now']] : []),
    ...(r.status === 'failed' || r.status === 'aborted' ? [['retry', 'retry the failed work; completed steps are kept']] : []),
  ].map(([c, what]) => [`/workflow ${c} ${r.id}`, what]);
  const saveAsRecipe = () => {
    if (!workflows || !plan) return;
    const name = (plan.name || 'recipe').replace(/[^A-Za-z0-9._-]/g, '-');
    const path = `${workflows.path}/${name}.workflow.json`;
    save.mutate({ path, content: `${JSON.stringify(plan, null, 2)}\n`, createOnly: true }, {
      onSuccess: () => onOpenNode({ kind: 'file', id: `workflows:${name}.workflow.json`, name: `${name}.workflow.json`, path }),
      onError: (e) => notify(errorMessage(e), 'error'),
    });
  };

  const details = node ? (
    <Stack spacing={1.25} sx={{ p: 1.5 }} data-section="run-node">
      <Button size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => setSelected([])}>← The run</Button>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="subtitle2" sx={{ fontFamily: 'monospace' }}>{node.id}</Typography>
        {ns ? <RunStatus status={ns.status} awaiting={ns.awaitingUserInput} /> : <Chip size="small" variant="outlined" label="not reached" />}
      </Stack>
      {ns && (
        <Typography variant="body2" color="text.secondary">
          {[ns.agentName && `agent ${ns.agentName}`, ns.modelId && `model ${ns.modelId}`, ns.startedAt && `took ${took(ns.startedAt, ns.endedAt)}`, ns.runs > 1 && `ran ${ns.runs} times`,
            ns.completionSignal && `signalled ${ns.completionSignal}`].filter(Boolean).join(' · ')}
        </Typography>
      )}
      {ns?.failureReason && <Alert severity="error" variant="outlined">{ns.failureReason}</Alert>}
      {ns?.awaitingUserInput && <Alert severity="warning" variant="outlined">This step is waiting for your answer. Reopen the run&apos;s chat and reply to the step in the monitor (/workflow).</Alert>}
      {ns?.artifacts && Object.entries(ns.artifacts).map(([k, p]) => (
        <Button key={k} size="small" startIcon={<Description />} sx={{ justifyContent: 'flex-start', textTransform: 'none' }} onClick={() => openFile(p)}>{k}: {baseName(p)}</Button>
      ))}
      {ns?.capturedOutput && (
        <Box>
          <Typography variant="overline" color="text.secondary">What it said last</Typography>
          <Box component="pre" sx={{ m: 0, p: 1, borderRadius: 1, bgcolor: SURFACE.panel, whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 420, overflow: 'auto' }}>{ns.capturedOutput}</Box>
        </Box>
      )}
      {!ns && <Typography variant="body2" color="text.secondary">The run hasn&apos;t reached this node.</Typography>}
      {node.prompt && (
        <Box>
          <Typography variant="overline" color="text.secondary">Its prompt</Typography>
          <Box component="pre" sx={{ m: 0, p: 1, borderRadius: 1, bgcolor: SURFACE.panel, whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 260, overflow: 'auto', color: 'text.secondary' }}>{node.prompt}</Box>
        </Box>
      )}
    </Stack>
  ) : (
    <Stack spacing={1.5} sx={{ p: 1.5 }} data-section="run-summary">
      <Box sx={BOX}>
        <Typography variant="overline" color="text.secondary">Act on it in Kiro</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          The run belongs to the Kiro chat that started it; pause, resume and steer it there.
        </Typography>
        {r.resumeCommand && (
          <Tooltip title="Resume the chat this run belongs to, in its project folder">
            <span><Button size="small" variant="outlined" startIcon={<Terminal />} disabled={resume.pending}
              onClick={() => resume.resume({ folder: r.workspace, resumeCommand: r.resumeCommand })}>Terminal</Button></span>
          </Tooltip>
        )}
        <Stack sx={{ mt: 1 }}>
          {commands.map(([cmd, what]) => (
            <Stack key={cmd} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Box component="code" sx={{ fontSize: 12 }}>{cmd}</Box>
              <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>{what}</Typography>
              <Button size="small" color="inherit" startIcon={<ContentCopy />} onClick={() => copy(cmd)}>Copy</Button>
            </Stack>
          ))}
        </Stack>
      </Box>
      {r.request?.length > 0 && (
        <Box sx={BOX}>
          <Typography variant="overline" color="text.secondary">Asked in the chat</Typography>
          {r.request.map((m, i) => <Typography key={i} variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{m}</Typography>)}
        </Box>
      )}
      {Object.keys(r.inputs || {}).length > 0 && (
        <Box sx={BOX}>
          <Typography variant="overline" color="text.secondary">Inputs</Typography>
          {Object.entries(r.inputs).map(([k, v]) => (
            <Typography key={k} variant="body2"><Box component="code">{k}</Box>: <Box component="span" color="text.secondary">{v}</Box></Typography>
          ))}
        </Box>
      )}
      <Box sx={BOX} data-section="run-files">
        <Typography variant="overline" color="text.secondary">Files it wrote</Typography>
        {Object.entries(r.artifacts || {}).map(([k, p]) => (
          <Button key={k} size="small" startIcon={<Description />} sx={{ display: 'flex', justifyContent: 'flex-start', textTransform: 'none' }} onClick={() => openFile(p)}>{k}: {p}</Button>
        ))}
        {!Object.keys(r.artifacts || {}).length && <Typography variant="body2" color="text.secondary">None yet.</Typography>}
      </Box>
      {plan && workflows && (
        <Box>
          <Button size="small" startIcon={<Save />} onClick={saveAsRecipe} disabled={save.isPending}>Save this plan as a recipe</Button>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Saves {plan.name}.workflow.json in this scope&apos;s workflows, to run again with /workflow run.</Typography>
        </Box>
      )}
      <Typography variant="caption" color="text.secondary">Select a node in the graph to see what it did.</Typography>
    </Stack>
  );

  return (
    <EditorFrame icon={<History />} title={r.label || r.name} path={r.dir}
      status={<><RunStatus status={r.status} /><Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>{r.name} · started {timeAgo(r.createdAt)} · {r.stepsDone} of {r.steps} steps</Typography></>}>
      <Box sx={{ height: '100%', display: 'flex', minHeight: 0 }}>
        <Box sx={{ flex: '1 1 58%', minWidth: 0, overflow: 'auto' }}>
          {plan ? <WorkflowGraph recipe={plan} selected={selected} onSelect={setSelected} status={status} />
            : <Alert severity="info" sx={{ m: 2 }}>Kiro didn&apos;t keep this run&apos;s plan, so only its summary is shown.</Alert>}
        </Box>
        <Box sx={{ flex: '1 1 42%', minWidth: 320, maxWidth: 560, overflow: 'auto', borderLeft: `1px solid ${SURFACE.border}` }}>{details}</Box>
      </Box>
    </EditorFrame>
  );
}
