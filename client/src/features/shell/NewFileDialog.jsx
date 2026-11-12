/**
 * @fileoverview Creates a hook file, steering file, prompt, skill or workflow
 * recipe in the active scope from a name, with a starter template, then opens it.
 */
import { useEffect, useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from '@mui/material';
import { useSaveFile } from '../../data/useFiles';
import { errorMessage } from '../../data/errors';
import { EMPTY_HOOK_FILE } from '../../domain/hooks.js';
import { formatJson } from '../../domain/json.js';
import { recipeFromTemplate } from '../../domain/workflows.js';
import { RECIPE_TEMPLATES } from '../../domain/workflowTemplates.js';

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** What a new file of each group kind looks like and where it goes. */
const KINDS = {
  hooks: {
    title: 'New hook file', hint: 'Hooks in this file run for every agent in this scope.',
    file: (dir, n) => `${dir}/${n}.json`, content: () => `${formatJson(EMPTY_HOOK_FILE)}\n`,
    node: (path, n) => ({ kind: 'hookfile', id: `hooks:${n}.json`, name: `${n}.json`, path }),
  },
  steering: {
    title: 'New steering file', hint: 'Steering gives Kiro standing instructions. New files start with "inclusion: always", so they apply to every chat.',
    file: (dir, n) => `${dir}/${n}.md`, content: (n) => `---\ninclusion: always\n---\n\n# ${n}\n\n`,
    node: (path, n) => ({ kind: 'file', id: `steering:${n}.md`, name: `${n}.md`, path }),
  },
  prompts: {
    title: 'New prompt', hint: 'A message you save once and reuse. Write what you would type into the chat; run it with / and this name.',
    max: 50,
    file: (dir, n) => `${dir}/${n}.md`, content: () => '',
    node: (path, n) => ({ kind: 'file', id: `prompts:${n}.md`, name: `${n}.md`, path }),
  },
  workflows: {
    title: 'New recipe', hint: 'Start from one of the patterns in Kiro\'s docs, then change the steps, agents and limits to fit your work.',
    file: (dir, n, o) => `${dir}/${n}.workflow.${o.format}`, content: (n, o) => recipeFromTemplate(o.template, n, o.format),
    node: (path, n, o) => ({ kind: 'file', id: `workflows:${n}.workflow.${o.format}`, name: `${n}.workflow.${o.format}`, path }),
    options: true,
  },
  skills: {
    title: 'New skill', hint: 'A folder with a SKILL.md. Write its description next: Kiro uses the skill when your request matches it.',
    file: (dir, n) => `${dir}/${n}/SKILL.md`,
    content: (n) => `---\nname: ${n}\ndescription: \n---\n\n## Steps\n\n1. \n\n## Checklist\n\n- \n`,
    node: (path, n) => ({ kind: 'file', id: `skill:${n}`, name: n, path }),
  },
};

/**
 * @param {Object} props
 * @param {Object|null} props.group the group node to add to (null = closed).
 * @param {() => void} props.onClose
 * @param {(node: Object) => void} props.onCreated
 */
export function NewFileDialog({ group, onClose, onCreated }) {
  const save = useSaveFile();
  const [name, setName] = useState('');
  const [serverError, setServerError] = useState('');
  const [opts, setOpts] = useState({ template: 'plan', format: 'json' }); // workflows: which pattern, JSON or YAML
  useEffect(() => { setName(''); setServerError(''); }, [group]);
  const kind = group && KINDS[group.kind];
  const n = name.trim();
  const error = n && !NAME.test(n) ? 'Use letters, digits, dot, dash or underscore'
    : kind?.max && n.length > kind.max ? `Use at most ${kind.max} characters` : serverError;

  const submit = () => {
    if (!kind || !n || error) return;
    const path = kind.file(group.path, n, opts);
    save.mutate({ path, content: kind.content(n, opts), createOnly: true }, {
      onSuccess: () => onCreated(kind.node(path, n, opts)),
      onError: (e) => setServerError(errorMessage(e)),
    });
  };

  return (
    <Dialog open={!!kind} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{kind?.title}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{kind?.hint}</Typography>
        <TextField autoFocus fullWidth size="small" label="Name" value={name}
          onChange={(e) => { setName(e.target.value); setServerError(''); }}
          onKeyDown={(e) => e.key === 'Enter' && submit()} error={!!error} helperText={error || ' '} />
        {kind?.options && (
          <>
            <TextField select fullWidth size="small" label="Start from" value={opts.template} sx={{ mt: 1 }}
              onChange={(e) => setOpts({ ...opts, template: e.target.value })} helperText={RECIPE_TEMPLATES.find((t) => t.id === opts.template)?.description}>
              {RECIPE_TEMPLATES.map((t) => <MenuItem key={t.id} value={t.id}>{t.label}</MenuItem>)}
            </TextField>
            <TextField select fullWidth size="small" label="Format" value={opts.format} sx={{ mt: 2 }} onChange={(e) => setOpts({ ...opts, format: e.target.value })}
              helperText="Kiro reads both; JSON is what Kiro writes itself">
              <MenuItem value="json">JSON (.workflow.json)</MenuItem>
              <MenuItem value="yaml">YAML (.workflow.yaml)</MenuItem>
            </TextField>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={!n || !!error || save.isPending}>Create</Button>
      </DialogActions>
    </Dialog>
  );
}

/** @returns {boolean} whether a group kind supports creating files here. */
export const canCreateIn = (kind) => kind in KINDS;

/** The button text for creating in a group, e.g. "New hook file". */
export const createLabel = (kind) => KINDS[kind]?.title || 'New';
