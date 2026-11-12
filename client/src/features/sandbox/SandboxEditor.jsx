/**
 * @fileoverview The sandbox, which limits what shell commands an agent runs
 * can reach (kiro.dev/docs/sandbox), with everything it depends on in one
 * place: sandbox.json (on or off, network mode, MCP wrapping), the
 * permission rules it follows from this scope's permissions.yaml
 * (sandbox_network hosts, and fs_read / fs_write paths), and how to use it.
 * Clicking a card shows its file on the right; cards and files stay in sync,
 * and one Save writes both. The same rules are on the Permissions page.
 */
import { useCallback, useState } from 'react';
import {
  Alert, AlertTitle, Box, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography,
} from '@mui/material';
import { Gavel, School, Shield } from '@mui/icons-material';
import { usePermissions, useSandbox, useSaveSandbox } from '../../data/useSettings';
import { useFileText, useSaveFile } from '../../data/useFiles';
import useTextDocument from '../../hooks/useTextDocument';
import { readPermissions, writePermissions } from '../../domain/permYaml.js';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { errorMessage } from '../../data/errors';
import useJsonDocument from '../../hooks/useJsonDocument';
import { useEditorGuard } from '../../contexts/UnsavedChangesContext';
import { isObject, setField } from '../../domain/json.js';
import { NETWORK_MODES, SANDBOX_CAPS, allowedModes, globalActive, mergeSandboxRules, sandboxProblems, sandboxRules } from '../../domain/sandbox.js';
import { EditorFrame, EditStatus, SaveButton } from '../../ui/EditorFrame';
import { CodeEditor } from '../../ui/CodeEditor';
import { SplitPane } from '../../ui/SplitPane';
import { Loading, ErrorState } from '../../ui/States';
import { useNotify } from '../../ui/NotifyProvider';
import { SectionCard } from '../../ui/SectionCard';
import { RulesEditor } from '../permissions/RulesEditor';
import { TerminalButton } from '../launcher/TerminalButton';

const validate = (v) => (isObject(v) ? '' : 'The sandbox config must be a JSON object');

export function SandboxEditor() {
  const query = useSandbox();
  const perms = usePermissions();
  const permFile = useFileText(perms.data?.path, !!perms.data, true);
  if (query.isLoading || perms.isLoading || permFile.isLoading) return <Loading />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={query.refetch} />;
  if (perms.isError) return <ErrorState message={errorMessage(perms.error)} onRetry={perms.refetch} />;
  if (permFile.isError) return <ErrorState message={errorMessage(permFile.error)} onRetry={permFile.refetch} />;
  return <SandboxForm key={query.data.path} doc={query.data} permPath={perms.data.path} permLoaded={permFile.data?.content ?? ''} />;
}

/** permissions.yaml as { policies, rules }. */
const readForm = (text) => {
  const { policies, rules, error } = readPermissions(text);
  return { value: error ? null : { policies, rules }, error };
};
const NEW_HOST_RULE = { capability: 'sandbox_network', match: [], effect: 'allow' };

function PlatformNote({ platform }) {
  if (!platform) return null;
  if (!platform.ready) {
    return (
      <Alert severity="warning" data-testid="sandbox-platform">
        <AlertTitle>This computer can&apos;t run the sandbox yet</AlertTitle>
        Missing: {platform.missing.join(', ')}. {platform.note}
      </Alert>
    );
  }
  if (platform.partial?.length) {
    return (
      <Alert severity="info" variant="outlined" data-testid="sandbox-platform">
        The sandbox works here. Install {platform.partial.join(', ')} too if you use &quot;Common services&quot;, or &quot;Blocked&quot; with
        allowed hosts: Kiro needs it for those.
      </Alert>
    );
  }
  return platform.note ? <Alert severity="info" variant="outlined" data-testid="sandbox-platform">{platform.note}</Alert> : null;
}

function SandboxForm({ doc, permPath, permLoaded }) {
  const { isWorkspaceMode } = useWorkspace();
  const save = useSaveSandbox();
  const saveFile = useSaveFile();
  const notify = useNotify();
  const sb = useJsonDocument(doc.config, doc.path, validate);
  const perm = useTextDocument(permLoaded, permPath, readForm, writePermissions);
  const [active, setActive] = useState('sandbox'); // which file is on the right: sandbox | permissions
  const config = sb.doc;
  const form = perm.value || { policies: [], rules: [] };
  const rules = sandboxRules(form.rules);
  const setRules = (next) => perm.setValue({ ...form, rules: mergeSandboxRules(form.rules, next) });
  const global = isWorkspaceMode ? doc.global : undefined;
  const problems = isObject(config) ? sandboxProblems(config, global) : [];
  const set = (key, value) => sb.setDoc(setField(config, key, value));
  const modes = allowedModes(global);
  const mode = NETWORK_MODES.find((m) => m.value === (config.networkAccess || 'DEFAULT_BLOCKED'));
  const dirty = sb.dirty || perm.dirty;
  const error = sb.error || perm.error;
  const saving = save.isPending || saveFile.isPending;
  const hosts = rules.filter((r) => r.capability === 'sandbox_network').length;

  const onSave = useCallback(async () => {
    try {
      if (sb.dirty) { await save.mutateAsync(config); sb.markSaved(config); }
      if (perm.dirty) { await saveFile.mutateAsync({ path: permPath, content: perm.text }); perm.markSaved(perm.text); }
      notify('Saved. Kiro applies sandbox changes to running chats.', 'success');
    } catch (e) { notify(errorMessage(e), 'error'); }
  }, [sb, perm, save, saveFile, config, permPath, notify]);
  useEditorGuard({ dirty, canSave: dirty && !error && !saving, onSave });

  const card = (id, file, props, children) => (
    <Box data-section={`sandbox-${id}`}>
      <SectionCard {...props} active={!!file && active === file} onActivate={file ? () => setActive(file) : undefined}>{children}</SectionCard>
    </Box>
  );
  const left = (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="body2" color="text.secondary">
        The sandbox runs the shell commands an agent starts in an isolated environment, so they can only reach the files your
        permission rules allow and the network you choose here. Kiro CLI V3 and the Kiro IDE use it.
      </Typography>
      <PlatformNote platform={doc.platform} />
      {card('settings', 'sandbox', { icon: <Shield />, title: 'Sandbox', summary: config.enabled === true ? `on · ${mode?.label || 'Blocked'} network${config.mcpSandboxing ? ' · local MCP servers too' : ''}` : 'off', defaultOpen: true }, (
        <Stack spacing={1.5}>
          {isWorkspaceMode && (
            <Alert severity="info" variant="outlined">
              {globalActive(global)
                ? `Global turns the sandbox on with ${global.networkAccess || 'DEFAULT_BLOCKED'} network access. This Workspace can make it stricter, but not looser.`
                : 'Global doesn\'t turn the sandbox on, so this Workspace can turn it on for this project.'}
            </Alert>
          )}
          <FormControlLabel label="Run agent shell commands in the sandbox"
            control={<Switch checked={config.enabled === true} onChange={(e) => set('enabled', e.target.checked)} />} />
          <TextField select size="small" label="Network access" value={config.networkAccess || ''} disabled={config.enabled !== true}
            onChange={(e) => set('networkAccess', e.target.value || undefined)}
            helperText={mode?.help}>
            <MenuItem value=""><em>Kiro&apos;s default (Blocked)</em></MenuItem>
            {NETWORK_MODES.map((m) => (
              <MenuItem key={m.value} value={m.value} disabled={!modes.includes(m)}>
                {m.label} ({m.value}){!modes.includes(m) ? ': looser than Global' : ''}
              </MenuItem>
            ))}
          </TextField>
          <FormControlLabel disabled={config.enabled !== true}
            label="Also run local (stdio) MCP servers in the sandbox"
            control={<Switch checked={config.mcpSandboxing === true} onChange={(e) => set('mcpSandboxing', e.target.checked || undefined)} />} />
          <Typography variant="caption" color="text.secondary">Remote MCP servers aren&apos;t affected.</Typography>
          {problems.map((p) => <Alert key={p} severity="warning">{p}</Alert>)}
        </Stack>
      ))}
      {card('rules', 'permissions', { icon: <Gavel />, title: 'Permission rules it follows', defaultOpen: true,
        summary: rules.length ? `${rules.length} rule${rules.length === 1 ? '' : 's'}${hosts ? ` · ${hosts} for hosts` : ''} (permissions.yaml)` : 'none yet (permissions.yaml)' }, (
        <Stack spacing={1.5}>
          <Typography variant="caption" color="text.secondary">
            From this {isWorkspaceMode ? 'Workspace' : 'Global'} permissions.yaml, the same rules as on the Permissions page.
            {' '}<strong>sandbox_network</strong> names the hosts sandboxed commands can reach: the first rule that matches a host decides, so put a
            specific deny before a broad allow. <strong>fs_read</strong> and <strong>fs_write</strong> (and filesystem or all) shape which paths
            they can see and write. Rules for other capabilities are on the Permissions page.
          </Typography>
          {perm.error && <Alert severity="error" variant="outlined">permissions.yaml has a problem, so its rules can&apos;t be edited here until it&apos;s fixed: {perm.error}</Alert>}
          <Box component="fieldset" disabled={!!perm.error} sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}>
            <RulesEditor rules={rules} onChange={setRules} only={SANDBOX_CAPS} template={NEW_HOST_RULE}
              emptyText="No rules yet. With Blocked, sandboxed commands reach no host; add a sandbox_network allow rule for each one they need." />
          </Box>
        </Stack>
      ))}
      {card('use', '', { icon: <School />, title: 'How to use it', summary: 'turn it on, check it, open hosts', defaultOpen: !config.enabled }, (
        <Box component="ol" sx={{ m: 0, pl: 2.5, '& li': { mb: 0.75 } }}>
          <Typography component="li" variant="body2">Turn on <strong>Run agent shell commands in the sandbox</strong>, keep <strong>Blocked</strong> to start, and Save.</Typography>
          <Typography component="li" variant="body2">Press <strong>Terminal</strong> and type <code>/sandbox</code> in the chat: it shows <strong>Active</strong> when commands are sandboxed.</Typography>
          <Typography component="li" variant="body2">Ask the agent to run <code>curl https://example.com</code>: with Blocked it can&apos;t reach the host, which shows the sandbox works.</Typography>
          <Typography component="li" variant="body2">To let commands reach one host, add a <strong>sandbox_network</strong> allow rule above with that host, e.g. <code>api.github.com</code>. For package installs, choose <strong>Common services</strong> instead.</Typography>
          {doc.platform?.os === 'windows'
            ? <Typography component="li" variant="body2">On Windows, Common services and Open need a one-time administrator setup: type <code>/sandbox setup</code> in a chat and approve it. Blocked works without it.</Typography>
            : null}
          <Typography component="li" variant="body2"><code>/autonomous on</code> in a chat lets Kiro work through a task without asking about each command; it turns the sandbox on with the network blocked.</Typography>
        </Box>
      ))}
    </Box>
  );
  const right = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Typography variant="caption" sx={{ fontFamily: 'monospace', px: 1.5, py: 0.75, borderBottom: 1, borderColor: 'divider' }} data-testid="sandbox-active-file">
        {active === 'permissions' ? permPath : doc.path}
      </Typography>
      <Box sx={{ flexGrow: 1, minHeight: 0 }}>
        {active === 'permissions'
          ? <CodeEditor key="permissions" value={perm.text} onChange={perm.setText} language="yaml" />
          : <CodeEditor key="sandbox" value={sb.text} onChange={sb.setText} />}
      </Box>
    </Box>
  );

  return (
    <EditorFrame
      icon={<Shield />} title="Sandbox" path={doc.path}
      status={<EditStatus dirty={dirty} error={error} isNew={!doc.exists} />}
      actions={<>
        <SaveButton dirty={dirty} valid={!error} saving={saving} onClick={onSave} />
        <TerminalButton title="Try the sandbox in Kiro CLI V3" hint={<>Type <code>/sandbox</code> to see whether it&apos;s Active and change it; <code>/sandbox setup</code> runs the Windows administrator setup.</>}
          disabledReason={dirty ? 'Save first: Kiro reads the saved files.' : ''} />
      </>}
    >
      <SplitPane persistKey="sandbox" initial={55} left={left} right={right} />
    </EditorFrame>
  );
}
