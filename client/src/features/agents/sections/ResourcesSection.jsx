/**
 * @fileoverview Context the agent loads: files (file://, loaded at start) and
 * skills (skill://, loaded on demand), plus whether it inherits installed
 * Powers. Knowledge bases share the `resources` list in the file but are
 * edited in the Knowledge section; this section leaves them untouched.
 */
import { useState } from 'react';
import {
  Box, Button, Chip, IconButton, Menu, MenuItem, Stack, Tooltip, Typography,
} from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import { useWorkspace } from '../../../contexts/WorkspaceContext';
import { useSurfaces } from '../../../data/useSystem';
import { isObject, setField } from '../../../domain/json.js';
import { BrowseButton } from '../../files/BrowseButton';
import { isKnowledgeBase } from '../../../domain/knowledge.js';
import { scopeUris } from '../../../domain/context.js';

const label = (r) => (isObject(r) ? JSON.stringify(r) : r);

/** @param {{spec: Object, onChange: (next: Object) => void}} props */
export function ResourcesSection({ spec, onChange }) {
  const { isWorkspaceMode } = useWorkspace();
  const { data } = useSurfaces();
  const [menu, setMenu] = useState(null);
  const uris = scopeUris(isWorkspaceMode);
  const resources = Array.isArray(spec.resources) ? spec.resources : [];
  const setResources = (next) => onChange(setField(spec, 'resources', next));
  const add = (r) => { if (!resources.includes(r)) setResources([...resources, r]); setMenu(null); };
  const children = (kind) => data?.nodes?.find((n) => n.kind === kind)?.children || [];

  const choices = [
    { label: 'All steering files', value: uris.allSteering },
    ...children('steering').map((n) => ({ label: `Steering: ${n.name}`, value: uris.steering(n.name) })),
    { label: 'All skills', value: uris.allSkills },
    ...children('skills').map((n) => ({ label: `Skill: ${n.name}`, value: uris.skill(n.name) })),
  ].filter((c) => !resources.includes(c.value));

  return (
    <Stack spacing={1.5}>
      <Stack spacing={0.75}>
        {resources.map((r, i) => (isKnowledgeBase(r) ? null : (
          <Stack sx={{ alignItems: "center" }} key={i} direction="row" spacing={1}>
            <Chip size="small" variant="outlined" label={isObject(r) ? 'kb' : String(r).split('://')[0] || 'file'} />
            <Typography variant="body2" sx={{ fontFamily: 'monospace', flexGrow: 1, minWidth: 0 }} noWrap title={label(r)}>{label(r)}</Typography>
            <Tooltip title="Remove"><IconButton size="small" onClick={() => setResources(resources.filter((_, j) => j !== i))}><Delete fontSize="small" /></IconButton></Tooltip>
          </Stack>
        )))}
        {!resources.some((r) => !isKnowledgeBase(r)) && <Typography variant="body2" color="text.secondary">No resources yet. The agent still gets your default steering and skills, unless that is turned off in Kiro settings.</Typography>}
      </Stack>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button size="small" startIcon={<Add />} disabled={!choices.length} onClick={(e) => setMenu(e.currentTarget)}>Steering or skill</Button>
        <BrowseButton label="File…" onPick={(path) => add(`file://${path}`)} />
      </Box>
      <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
        {choices.map((c) => <MenuItem key={c.value} onClick={() => add(c.value)}>{c.label}</MenuItem>)}
      </Menu>
    </Stack>
  );
}
