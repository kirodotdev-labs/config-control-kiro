/**
 * @fileoverview Adds a file to a skill folder: scripts/ (code Kiro runs),
 * references/ (documents it reads when told to) or assets/ (templates).
 * Either a new file, or existing files copied in: a skill (and a power,
 * when Kiro installs or shares it) only carries what is inside its folder,
 * so files are copied, not linked. Used by skills and by skills in powers.
 */
import { useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { Close } from '@mui/icons-material';
import { SKILL_FOLDERS } from '../../domain/skills.js';
import { useCopyFile, useDirectory, useSaveFile } from '../../data/useFiles';
import { errorMessage } from '../../data/errors';
import { useNotify } from '../../ui/NotifyProvider';
import { useConfirm } from '../../ui/ConfirmProvider';
import { BrowseButton } from '../files/BrowseButton';
import { baseName } from '../files/paths';

const BAD_NAME = /[\\/]|^\.|\.\.|[<>:"|?*]/;

/**
 * @param {Object} props
 * @param {{name: string, dir: string}|null} props.skill the skill to add to; null closes the dialog.
 * @param {() => void} props.onClose
 * @param {(node: Object) => void} props.onCreated the new (or last copied) file's navigator node.
 */
export function AddSkillFileDialog({ skill, onClose, onCreated }) {
  const [how, setHow] = useState('new'); // new | copy
  const [folder, setFolder] = useState('scripts');
  const [name, setName] = useState('');
  const [picked, setPicked] = useState([]); // source paths to copy
  const save = useSaveFile();
  const copy = useCopyFile();
  const notify = useNotify();
  const confirm = useConfirm();
  const existing = useDirectory(skill && how === 'copy' ? `${skill.dir}/${folder}` : '');
  const taken = new Set((existing.data?.files || []).map((f) => f.name));
  const n = name.trim();
  const error = !n ? '' : BAD_NAME.test(n) ? 'A file name only: no folders or special characters' : '';
  const nodeFor = (rel) => ({ kind: 'file', id: `skillfile:${skill.name}/${rel}`, name: rel, path: `${skill.dir}/${rel}` });
  const done = (rel) => { setName(''); setPicked([]); onCreated(nodeFor(rel)); };
  const busy = save.isPending || copy.isPending;

  const create = () => {
    const rel = `${folder}/${n}`;
    save.mutate({ path: `${skill.dir}/${rel}`, content: folder === 'scripts' ? '#!/bin/sh\nset -e\n\n' : '', createOnly: true }, {
      onSuccess: () => done(rel),
      onError: (e) => notify(errorMessage(e), 'error'),
    });
  };
  const copyIn = async () => {
    let last = '';
    for (const source of picked) {
      const rel = `${folder}/${baseName(source)}`;
      const dest = `${skill.dir}/${rel}`;
      const overwrite = taken.has(baseName(source));
      if (overwrite && !await confirm({ title: `Replace ${rel}?`, body: `${skill.name} already has ${rel}. Replace it with ${source}?`, confirmLabel: 'Replace', danger: true })) continue;
      try {
        await copy.mutateAsync({ source, dest, overwrite });
        last = rel;
      } catch (e) { notify(errorMessage(e), 'error'); return; }
    }
    if (last) { notify(picked.length === 1 ? `Copied into ${folder}/` : `Copied ${picked.length} files into ${folder}/`, 'success'); done(last); }
  };

  return (
    <Dialog open={!!skill} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Add a file to {skill?.name}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        <ToggleButtonGroup size="small" exclusive value={how} onChange={(_, v) => v && setHow(v)}>
          <ToggleButton value="new">New file</ToggleButton>
          <ToggleButton value="copy">Copy existing files</ToggleButton>
        </ToggleButtonGroup>
        <TextField select size="small" label="Folder" value={folder} onChange={(e) => setFolder(e.target.value)} helperText={SKILL_FOLDERS.find((f) => f.dir === folder)?.hint}>
          {SKILL_FOLDERS.map((f) => <MenuItem key={f.dir} value={f.dir}>{f.dir}/</MenuItem>)}
        </TextField>
        {how === 'new' ? (
          <TextField autoFocus size="small" label="File name" value={name} onChange={(e) => setName(e.target.value)} error={!!error}
            helperText={error || `${folder}/${n || 'name.ext'}. Mention it in SKILL.md so Kiro knows when to use it.`}
            onKeyDown={(e) => { if (e.key === 'Enter' && n && !error) create(); }} />
        ) : (
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              The files are copied into {folder}/ under the same names. The skill only carries what is inside its folder,
              so a copy keeps working when the skill (or its power) is installed or shared. Mention each file in SKILL.md so Kiro knows when to use it.
            </Typography>
            {picked.map((p) => (
              <Stack key={p} direction="row" spacing={1} sx={{ alignItems: 'center' }} data-picked={p}>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }} noWrap>{folder}/{baseName(p)}</Typography>
                  <Typography variant="caption" color={taken.has(baseName(p)) ? 'warning.main' : 'text.secondary'} noWrap sx={{ display: 'block' }}>
                    from {p}{taken.has(baseName(p)) ? ' · replaces the file already there' : ''}
                  </Typography>
                </Box>
                <IconButton size="small" aria-label={`Remove ${p}`} onClick={() => setPicked((l) => l.filter((x) => x !== p))}><Close fontSize="small" /></IconButton>
              </Stack>
            ))}
            <Box>
              <BrowseButton label={picked.length ? 'Add another…' : 'Choose a file…'} title="Copy a file into the skill"
                onPick={(p) => setPicked((l) => (l.includes(p) ? l : [...l, p]))} />
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        {how === 'new'
          ? <Button variant="contained" onClick={create} disabled={!n || !!error || busy}>Create</Button>
          : <Button variant="contained" onClick={copyIn} disabled={!picked.length || busy}>Copy {picked.length > 1 ? `${picked.length} files` : ''}</Button>}
      </DialogActions>
    </Dialog>
  );
}
