/**
 * @fileoverview The Skills page: what skills are, every skill here with its
 * description and problems, New skill and Import (GitHub folder or local folder).
 */
import { useState } from 'react';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Link, Stack, TextField, Typography } from '@mui/material';
import { Add, Download, School, WarningAmber } from '@mui/icons-material';
import { useImportSkill, useSkills } from '../../data/useSkills';
import { errorMessage } from '../../data/errors';
import { useNotify } from '../../ui/NotifyProvider';
import { Loading } from '../../ui/States';
import { SURFACE } from '../../theme';

/**
 * @param {Object} props
 * @param {Object} props.node the Skills group node.
 * @param {(group: Object) => void} props.onCreate open the New skill dialog.
 * @param {(name: string) => void} props.onOpenSkill
 */
export function SkillsOverview({ node, onCreate, onOpenSkill }) {
  const skills = useSkills();
  const [importing, setImporting] = useState(false);
  return (
    <Box sx={{ p: 3, overflow: 'auto', height: '100%' }}>
      <Stack spacing={2} sx={{ maxWidth: 860 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <School color="primary" />
          <Typography variant="h6">Skills</Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Button variant="outlined" startIcon={<Download />} onClick={() => setImporting(true)}>Import a skill</Button>
          <Button variant="contained" startIcon={<Add />} onClick={() => onCreate(node)}>New skill</Button>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          Each folder here with a <code>SKILL.md</code> is one skill. <code>SKILL.md</code> is what Kiro reads: its description decides when the skill
          activates, its text is the instructions. Any other files in the folder (<code>scripts/</code>, <code>references/</code>, <code>assets/</code>) are
          for the instructions to use. Open a skill in the tree to see and add its files.
          {' '}<Link href="https://kiro.dev/docs/skills/" target="_blank" rel="noreferrer">Kiro docs</Link>
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>{node.path}</Typography>
        {skills.isLoading && <Loading />}
        {skills.data?.length === 0 && <Alert severity="info" variant="outlined">No skills here yet. Create one, or import one from a GitHub folder or a folder on this machine.</Alert>}
        {(skills.data || []).map((s) => (
          <Box key={s.name} data-skill={s.name} onClick={() => onOpenSkill(s.name)}
            sx={{ p: 1.5, border: `1px solid ${SURFACE.border}`, borderRadius: 2, cursor: 'pointer', '&:hover': { borderColor: 'primary.main' } }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography variant="subtitle2" sx={{ fontFamily: 'monospace' }}>/{s.name}</Typography>
              {s.files.length > 0 && <Chip size="small" variant="outlined" label={`${s.files.length} file${s.files.length > 1 ? 's' : ''}`} />}
              {s.problems.length > 0 && <Chip size="small" color="warning" variant="outlined" icon={<WarningAmber />} label="Kiro may skip it" />}
            </Stack>
            <Typography variant="body2" color={s.description ? 'text.primary' : 'text.secondary'}>{s.description || 'No description, so Kiro never activates it.'}</Typography>
            {s.problems.map((p) => <Typography key={p} variant="caption" color="warning.main" sx={{ display: 'block' }}>{p}</Typography>)}
          </Box>
        ))}
      </Stack>
      <ImportSkillDialog open={importing} onClose={() => setImporting(false)} onImported={(name) => { setImporting(false); onOpenSkill(name); }} />
    </Box>
  );
}

function ImportSkillDialog({ open, onClose, onImported }) {
  const [source, setSource] = useState('');
  const run = useImportSkill();
  const notify = useNotify();
  const submit = () => run.mutate(source, {
    onSuccess: (sk) => { setSource(''); notify(`${sk.name} imported${sk.problems.length ? ', with problems to fix' : ''}`, sk.problems.length ? 'warning' : 'success'); onImported(sk.name); },
    onError: (e) => notify(errorMessage(e), 'error'),
  });
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Import a skill</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 1 }}>
        <Typography variant="body2" color="text.secondary">
          The folder is copied into this scope&apos;s skills folder and works in the next chat. It must contain a SKILL.md.
        </Typography>
        <TextField autoFocus size="small" label="GitHub folder URL, or a folder on this machine" value={source} onChange={(e) => setSource(e.target.value)}
          placeholder="https://github.com/owner/repo/tree/main/skills/pr-review   or   ~/skills/pr-review"
          helperText="A GitHub URL must point at the skill's folder (or its SKILL.md) in a public repository, not the repository root."
          onKeyDown={(e) => { if (e.key === 'Enter' && source.trim()) submit(); }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={!source.trim() || run.isPending}>{run.isPending ? 'Importing…' : 'Import'}</Button>
      </DialogActions>
    </Dialog>
  );
}
