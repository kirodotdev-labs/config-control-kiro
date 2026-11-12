/**
 * @fileoverview The Workflows page: what a workflow is, turning workflows on,
 * how to start and control one in Kiro CLI, the runs and recipes in this
 * scope, and the agents Kiro ships for workflow steps.
 * Sources: kiro.dev/docs/workflows, /authoring, /manage.
 */
import { Box, Button, Chip, Link, Stack, Typography } from '@mui/material';
import { AccountTree, Add, ContentCopy, OpenInNew, WarningAmber } from '@mui/icons-material';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useFileText } from '../../data/useFiles';
import { useAllAgentIds } from '../../data/useAgents';
import { BUNDLED_AGENTS, checkRecipe, readRecipe, walkNodes } from '../../domain/workflows.js';
import { EditorFrame } from '../../ui/EditorFrame';
import { useNotify } from '../../ui/NotifyProvider';
import { SURFACE } from '../../theme';
import { TerminalButton } from '../launcher/TerminalButton';
import { WorkflowsSwitch } from './WorkflowsSwitch';
import { RunStatus } from './RunView';
import { useWorkflowRuns } from '../../data/useWorkflowRuns';
import { timeAgo } from '../../domain/sessions.js';

const DOCS = 'https://kiro.dev/docs/workflows/';
const COMMANDS = [
  ['/workflow run', 'Pick a saved recipe, fill in what it asks for, approve the plan'],
  ['/workflow', 'History of runs; select one to open its full-screen monitor'],
  ['/workflow status <id>', 'Print one run\'s status'],
  ['/workflow pause <id>', 'Pause at the next safe point'],
  ['/workflow resume <id>', 'Resume a paused run'],
  ['/workflow cancel <id>', 'Stop now (files already changed stay changed)'],
  ['/workflow retry <id> [node]', 'Retry failed or aborted work; completed steps are kept'],
];
const BOX = { p: 2, borderRadius: 2, border: `1px solid ${SURFACE.border}` };

/** One saved recipe: its name, description, size and problems. */
function RecipeRow({ node, onOpen }) {
  const file = useFileText(node.path);
  const { data: agents = [] } = useAllAgentIds();
  const { value, error } = readRecipe(file.data?.content || '', /\.ya?ml$/i.test(node.path) ? 'yaml' : 'json');
  const errors = value ? checkRecipe(value, { agents }).filter((p) => p.severity === 'error').length : 0;
  const steps = value ? walkNodes(value).filter((n) => n.node?.type === 'step').length : 0;
  return (
    <Box data-recipe={node.name} onClick={() => onOpen(node)} sx={{ ...BOX, p: 1.25, cursor: 'pointer', '&:hover': { borderColor: 'primary.main' } }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="subtitle2" sx={{ fontFamily: 'monospace' }}>{value?.name || node.name}</Typography>
        {value && <Chip size="small" variant="outlined" label={`${steps} step${steps === 1 ? '' : 's'}`} />}
        {(error || errors > 0) && <Chip size="small" color="warning" variant="outlined" icon={<WarningAmber />} label={error ? 'Not readable' : `${errors} to fix`} />}
      </Stack>
      <Typography variant="body2" color="text.secondary">{error || value?.description || 'No description.'}</Typography>
    </Box>
  );
}

/**
 * @param {Object} props
 * @param {Object} props.node the Workflows group node (its children are the recipes).
 * @param {(group: Object) => void} props.onCreate open New recipe.
 * @param {(node: Object) => void} props.onOpenRecipe
 * @param {(run: Object) => void} props.onOpenRun
 */
export function WorkflowsView({ node, onCreate, onOpenRecipe, onOpenRun }) {
  const runs = useWorkflowRuns();
  const { isWorkspaceMode } = useWorkspace();
  const notify = useNotify();
  const recipes = node.children || [];
  const copy = async (t) => { await navigator.clipboard.writeText(t); notify('Copied', 'success'); };
  return (
    <EditorFrame icon={<AccountTree />} title="Workflows" path={node.path}
      actions={<>
        <Button endIcon={<OpenInNew />} href={DOCS} target="_blank" rel="noopener noreferrer">Guide</Button>
        <TerminalButton title="Try workflows in Kiro CLI V3" hint={<>Type <code>/workflow run</code> to pick a recipe, or describe the outcome and ask for a workflow.</>} />
      </>}>
      <Box sx={{ overflow: 'auto', p: 3, height: '100%' }}>
        <Stack spacing={2} sx={{ maxWidth: 900 }}>
          <Typography variant="body1">
            A workflow hands a bigger job to a team of agents that work in the background while you keep chatting. Each step runs one agent in its
            own session; steps can run in order, repeat until a check passes, run side by side, or wait for a pull request. You can pause, steer or
            stop a run at any time. A <strong>recipe</strong> is a saved workflow you can run again.
          </Typography>

          <WorkflowsSwitch />

          <Box sx={BOX}>
            <Typography variant="overline" color="text.secondary">Start one</Typography>
            <Box component="ol" sx={{ m: 0, pl: 3 }}>
              <Typography component="li" variant="body2"><strong>Describe the outcome</strong> in a V3 chat, for example &quot;Use a workflow to investigate how auth works and bring me a cited report&quot;. Kiro proposes a plan; nothing runs until you approve it.</Typography>
              <Typography component="li" variant="body2"><strong>Run a recipe</strong>: type <code>/workflow run</code> and pick one of yours below, or one Kiro ships (<code>investigate</code>, <code>feature-pipeline</code>, <code>publish-pr</code>).</Typography>
              <Typography component="li" variant="body2"><strong>Save one</strong> Kiro made for you as a recipe here when it&apos;s worth reusing.</Typography>
            </Box>
            <Typography variant="caption" color="text.secondary">A workflow uses more credits than one chat: several agents, repeated reviews. Keep small tasks in the chat.</Typography>
          </Box>

          <Box sx={BOX} data-section="runs">
            <Typography variant="overline" color="text.secondary">Runs {isWorkspaceMode ? 'in this project' : 'in every project'}</Typography>
            <Stack spacing={0.75} sx={{ mt: 0.5 }}>
              {(runs.data || []).map((r) => (
                <Stack key={r.id} direction="row" spacing={1} data-run={r.id} onClick={() => onOpenRun(r)}
                  sx={{ alignItems: 'center', p: 1, borderRadius: 1.5, border: `1px solid ${SURFACE.border}`, cursor: 'pointer', '&:hover': { borderColor: 'primary.main' } }}>
                  <RunStatus status={r.status} />
                  <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Typography variant="body2" noWrap>{r.label || r.name}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                      {r.name} · {r.stepsDone} of {r.steps} steps{r.currentNode ? ` · now ${r.currentNode}` : ''} · {timeAgo(r.createdAt)}{isWorkspaceMode ? '' : ` · ${r.workspace}`}
                    </Typography>
                  </Box>
                </Stack>
              ))}
              {runs.data?.length === 0 && <Typography variant="body2" color="text.secondary">No runs yet. Runs started in Kiro CLI V3 appear here, with their steps and results.</Typography>}
            </Stack>
          </Box>

          <Box sx={BOX} data-section="recipes">
            <Stack direction="row" sx={{ alignItems: 'center', mb: 1 }}>
              <Typography variant="overline" color="text.secondary" sx={{ flexGrow: 1 }}>
                Recipes {isWorkspaceMode ? 'in this project (.kiro/workflows)' : 'for every project (~/.kiro/workflows)'}
              </Typography>
              <Button variant="contained" size="small" startIcon={<Add />} onClick={() => onCreate(node)}>New recipe</Button>
            </Stack>
            <Stack spacing={1}>
              {recipes.map((r) => <RecipeRow key={r.id} node={r} onOpen={onOpenRecipe} />)}
              {!recipes.length && <Typography variant="body2" color="text.secondary">No recipes here yet. New recipe starts from one of the docs&apos; patterns.</Typography>}
            </Stack>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
              {isWorkspaceMode ? 'A recipe here wins over a Global one with the same name, and travels with the repository.' : 'A Workspace recipe with the same name wins in that project.'}
              {' '}Kiro reads files named <code>&lt;name&gt;.workflow.json</code>, <code>.yaml</code> or <code>.yml</code>.
            </Typography>
          </Box>

          <Box sx={BOX} data-section="commands">
            <Typography variant="overline" color="text.secondary">Follow and control runs in Kiro CLI</Typography>
            {COMMANDS.map(([cmd, what]) => (
              <Stack key={cmd} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Box component="code" sx={{ minWidth: 220 }}>{cmd}</Box>
                <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>{what}</Typography>
                <Button size="small" color="inherit" startIcon={<ContentCopy />} onClick={() => copy(cmd.replace(/ <.*$/, ''))}>Copy</Button>
              </Stack>
            ))}
            <Typography variant="caption" color="text.secondary">When a step asks you something, the run pauses: open it in the monitor and reply to that step.</Typography>
          </Box>

          <Box sx={BOX} data-section="bundled-agents">
            <Typography variant="overline" color="text.secondary">Agents for steps</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Kiro ships these for workflow steps (they don&apos;t appear in /agent). A step can also use one of your own agents; Kiro&apos;s built-in sub-agents can&apos;t run a step.
              A step can do only what its agent&apos;s tools and your permission rules allow.
            </Typography>
            {BUNDLED_AGENTS.map((a) => (
              <Stack key={a.id} direction="row" spacing={1}>
                <Box component="code" sx={{ minWidth: 200 }}>{a.id}</Box>
                <Typography variant="body2" color="text.secondary">{a.role}</Typography>
              </Stack>
            ))}
            <Link href={`${DOCS}authoring/`} target="_blank" rel="noreferrer" variant="caption">How to write recipes</Link>
          </Box>
        </Stack>
      </Box>
    </EditorFrame>
  );
}
