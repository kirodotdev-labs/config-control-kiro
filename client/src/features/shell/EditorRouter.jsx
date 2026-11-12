/**
 * @fileoverview Opens the right editor for the node selected in the navigator.
 */
import { AgentsOverview } from '../agents/AgentsOverview';
import { AgentEditor } from '../agents/AgentEditor';
import { McpWorkbench } from '../mcp/McpWorkbench';
import { PermissionsEditor } from '../permissions/PermissionsEditor';
import { SandboxEditor } from '../sandbox/SandboxEditor';
import { HookFileEditor } from '../hooks/HookFileEditor';
import { FileEditor } from '../files/FileEditor';
import { SettingsEditor } from '../settings/SettingsEditor';
import { PowersView } from '../powers/PowersView';
import { PowerEditor } from '../powers/PowerEditor';
import { SpecsView } from '../specs/SpecsView';
import { SpecEditor } from '../specs/SpecEditor';
import { LspView } from '../lsp/LspView';
import { SessionsView } from '../sessions/SessionsView';
import { KiroignoreEditor } from '../kiroignore/KiroignoreEditor';
import { PolicyView } from '../policy/PolicyView';
import { Button, Stack, Typography } from '@mui/material';
import { Add } from '@mui/icons-material';
import { Centered, Hint } from '../../ui/States';
import { canCreateIn, createLabel } from './NewFileDialog';
import { FeatureView } from './FeatureView';
import { SkillEditor } from '../skills/SkillEditor';
import { AcpView } from '../acp/AcpView';
import { RecipeEditor } from '../workflows/RecipeEditor';
import { WorkflowsView } from '../workflows/WorkflowsView';
import { RunView } from '../workflows/RunView';
import { SkillsOverview } from '../skills/SkillsOverview';
import { baseName } from '../files/paths';

const GROUP_HINTS = {
  hooks: 'Hooks in these files run for every agent. Select a file on the left, or create one.',
  steering: 'Steering files give Kiro standing instructions. Select a file on the left, or create one. In a Workspace, AGENTS.md files in the project are listed here too: Kiro always includes them.',
  prompts: 'Create a prompt file and write the prompt in it, with $ARGUMENTS where your input should go. For review.md, run it in Kiro as /review production code: the prompt runs with "production code" in place of $ARGUMENTS, or on its own if you type nothing after the name.',
};

/**
 * What Delete removes for a file node: the file itself, or for a skill or a
 * spec the whole folder. Files the app only lists (AGENTS.md, .kiroignore) get nothing.
 */
function deleteTarget(node) {
  const [group] = node.id.split(/:(.*)/s);
  if (group === 'skillfile') return { path: node.path, label: baseName(node.path) };
  if (['specs', 'steering', 'prompts', 'workflows'].includes(group)) return { path: node.path, label: baseName(node.path) };
  return undefined;
}

/** The skill node a skill file belongs to. */
const skillOf = (node) => {
  const name = node.id.slice('skillfile:'.length).split('/')[0];
  const dir = node.path.slice(0, node.path.length - node.name.length - 1); // node.name is the path inside the skill
  return { kind: 'file', id: `skill:${name}`, name, path: `${dir}/SKILL.md` };
};

/** The page for a group with a visible way to create in it. */
function GroupHint({ node, onCreate }) {
  return (
    <Centered>
      <Stack spacing={2} alignItems="center" sx={{ maxWidth: 560, textAlign: 'center' }}>
        <Typography color="text.secondary">{GROUP_HINTS[node.kind] || node.name}</Typography>
        {canCreateIn(node.kind) && <Button variant="outlined" startIcon={<Add />} onClick={() => onCreate(node)}>{createLabel(node.kind)}</Button>}
      </Stack>
    </Centered>
  );
}

/**
 * @param {Object} props
 * @param {Object|null} props.node {kind, id, name, path}
 * @param {(id: string) => void} props.onOpenAgent
 * @param {(kind: string) => void} props.onOpenKind open the scope's item of that kind (e.g. sessions, settings).
 * @param {() => void} props.onClose clear the selection (e.g. after a delete).
 * @param {(group: Object) => void} props.onCreate open the New dialog for a group, or Add file for a skill node.
 * @param {(node: Object) => void} props.onOpenNode select another node (e.g. a skill, or one of its files).
 */
export function EditorRouter({ node, onOpenAgent, onOpenKind, onClose, onCreate, onOpenNode }) {
  if (!node) return <Hint text="Select an item on the left to edit it." />;
  switch (node.kind) {
    case 'agents': return <AgentsOverview onOpenAgent={onOpenAgent} />;
    case 'agent': return <AgentEditor id={node.name} onDeleted={onClose} onOpenKind={onOpenKind} />;
    case 'mcp': return <McpWorkbench />;
    case 'mcpserver': return <McpWorkbench key={node.id} server={node.name} />;
    case 'permissions': return <PermissionsEditor />;
    case 'sandbox': return <SandboxEditor />;
    case 'settings': return <SettingsEditor key={node.path} path={node.path} exists={node.exists} />;
    case 'powers': return <PowersView path={node.path} onOpenNode={onOpenNode} />;
    case 'power':
    case 'powersource': return <PowerEditor key={node.id} node={node} onGone={() => onOpenKind('powers')} />;
    case 'kiroignore': return <KiroignoreEditor key={node.path} path={node.path} exists={node.exists} />;
    case 'policy': return <PolicyView path={node.path} />;
    case 'sessions': return <SessionsView path={node.path} onOpenAgent={onOpenAgent} />;
    case 'workflows': return <WorkflowsView node={node} onCreate={onCreate} onOpenRecipe={onOpenNode}
      onOpenRun={(r) => onOpenNode({ kind: 'workflowrun', id: `wfrun:${r.id}`, name: r.label || r.name })} />;
    case 'workflowrun': return <RunView key={node.id} id={node.id.slice('wfrun:'.length)} onOpenNode={onOpenNode} />;
    case 'specs': return <SpecsView onOpenNode={onOpenNode} />;
    case 'spec': return <SpecEditor key={node.id} node={node} onGone={() => onOpenKind('specs')} />;
    case 'memory': return <FeatureView key={node.kind} kind={node.kind} path={node.path} onOpenSettings={() => onOpenKind('settings')} />;
    case 'lsp': return <LspView key={node.path} node={node} onOpenSettings={() => onOpenKind('settings')} />;
    case 'acp': return <AcpView onOpenSettings={() => onOpenKind('settings')} />;
    case 'hookfile': return <HookFileEditor path={node.path} onDeleted={() => onOpenKind('hooks')} />;
    case 'skills': return <SkillsOverview node={node} onCreate={onCreate} onOpenSkill={(name) => onOpenNode({ kind: 'file', id: `skill:${name}`, name, path: `${node.path}/${name}/SKILL.md` })} />;
    case 'file': if (/^power(source)?file:/.test(node.id)) return powerFileEditor(node, () => onOpenKind('powers'));
      if (node.id.startsWith('specfile:')) return specFileEditor(node, () => onOpenKind('specs'));
      return node.id.startsWith('kiroignore:')
      ? <KiroignoreEditor key={node.path} path={node.path} exists sub />
      : node.id.startsWith('skill:')
        ? <SkillEditor key={node.id} name={node.name} onDeleted={() => onOpenKind('skills')} onOpenAgent={onOpenAgent} onAddFile={() => onCreate(node)} />
        : node.id.startsWith('workflows:')
          ? <RecipeEditor key={node.path} path={node.path} deletable={deleteTarget(node)} onDeleted={() => onOpenKind('workflows')} />
        : node.other // a file an agent points at outside this scope (Other): SKILL.md gets the skill form, Markdown the steering form
          ? <FileEditor key={node.path} path={node.path} title={node.name} skill={node.other === 'skill'} steering={node.other === 'steering'} />
          : <FileEditor key={node.path} path={node.path} title={node.name} steering={node.id.startsWith('steering:')} prompt={node.id.startsWith('prompts:')} deletable={deleteTarget(node)} onDeleted={() => (node.id.startsWith('skillfile:') ? onOpenNode(skillOf(node)) : onOpenKind(node.id.split(':')[0]))} />;
    default: return <GroupHint node={node} onCreate={onCreate} />;
  }
}

/**
 * A file inside a power, from the navigator: the power's page with that file
 * shown. Same key as the power itself, so moving between its files keeps the edits.
 */
function powerFileEditor(node, onGone) {
  const own = node.id.startsWith('powersourcefile:');
  const [power, ...rest] = node.id.slice(node.id.indexOf(':') + 1).split('/');
  const rel = rest.join('/');
  const kind = own ? 'powersource' : 'power';
  const dir = node.path.slice(0, node.path.length - rel.length - 1);
  return <PowerEditor key={`${kind}:${power}`} node={{ kind, id: `${kind}:${power}`, name: power, path: dir }} file={rel} fileChoice={node} onGone={onGone} />;
}

/** A file inside a spec, from the navigator: the spec's page with that file shown (same key, so edits are kept). */
function specFileEditor(node, onGone) {
  const [spec, ...rest] = node.id.slice('specfile:'.length).split('/');
  const rel = rest.join('/');
  const dir = node.path.slice(0, node.path.length - rel.length - 1);
  return <SpecEditor key={`spec:${spec}`} node={{ kind: 'spec', id: `spec:${spec}`, name: spec, path: dir }} file={rel} fileChoice={node} onGone={onGone} />;
}
