/**
 * @fileoverview The front matter of a SKILL.md as a short form: Name and
 * Description (what Kiro reads at startup and matches against requests),
 * with the optional fields folded away.
 */
import { useState } from 'react';
import { Alert, Box, Button, Collapse, Stack, TextField } from '@mui/material';
import { ExpandLess, ExpandMore } from '@mui/icons-material';
import { descriptionAdvice, parseSkill, setSkillField, skillProblems } from '../../domain/skills.js';
import { KeyValueInput } from '../../ui/KeyValueInput';
import { SURFACE } from '../../theme';

/**
 * @param {Object} props
 * @param {string} props.text the whole SKILL.md.
 * @param {(next: string) => void} props.onChange
 * @param {string} props.folder the skill's folder name.
 */
export function SkillForm({ text, onChange, folder }) {
  const { fields, error } = parseSkill(text);
  const [more, setMore] = useState(!!(fields.license || fields.compatibility || Object.keys(fields.metadata).length));
  const set = (key) => (value) => onChange(setSkillField(text, key, value));
  const problems = error ? [] : skillProblems(fields, folder);
  const advice = descriptionAdvice(fields.description);
  return (
    <Box sx={{ p: 2, borderBottom: `1px solid ${SURFACE.border}`, display: 'flex', flexDirection: 'column', gap: 1.5 }} data-section="skill">
      {error && <Alert severity="error" variant="outlined">{error}. Fix the lines between the --- fences below.</Alert>}
      {problems.map((p) => <Alert key={p} severity="warning" variant="outlined">{p}</Alert>)}
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
        <TextField size="small" label="Name" value={fields.name} onChange={(e) => set('name')(e.target.value)} sx={{ width: 260, flexShrink: 0 }}
          slotProps={{ input: { sx: { fontFamily: 'monospace' } } }} helperText={`In a chat: /${fields.name || folder}`} />
        <TextField size="small" label="Description" value={fields.description} fullWidth multiline maxRows={3}
          onChange={(e) => set('description')(e.target.value)}
          placeholder="What it does, then when to use it. Kiro matches this against your requests."
          helperText={advice || (fields.description ? `${fields.description.length}/1024` : 'Required: without it Kiro never uses the skill.')} />
      </Stack>
      <Box>
        <Button size="small" color="inherit" endIcon={more ? <ExpandLess /> : <ExpandMore />} onClick={() => setMore((m) => !m)} sx={{ textTransform: 'none' }}>
          Optional fields (license, compatibility, metadata)
        </Button>
        <Collapse in={more} unmountOnExit>
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Stack direction="row" spacing={1.5}>
              <TextField size="small" label="License" value={fields.license} onChange={(e) => set('license')(e.target.value)} sx={{ flex: 1 }} />
              <TextField size="small" label="Compatibility" value={fields.compatibility} onChange={(e) => set('compatibility')(e.target.value)} sx={{ flex: 1 }}
                placeholder="e.g. docker, network access" />
            </Stack>
            <KeyValueInput label="Metadata" keyLabel="Key" value={fields.metadata} onChange={set('metadata')} hint="author, version, anything else" />
          </Stack>
        </Collapse>
      </Box>
    </Box>
  );
}
