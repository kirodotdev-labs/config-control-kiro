/**
 * @fileoverview Name, description and system prompt. The prompt can be inline
 * text or a file:// reference to a prompt file.
 */
import { Alert, Stack, TextField } from '@mui/material';
import { setField } from '../../../domain/json.js';
import { BrowseButton } from '../../files/BrowseButton';

/** @param {{id: string, spec: Object, format: string, onChange: (next: Object) => void}} props */
export function IdentitySection({ id, spec, format, onChange }) {
  const prompt = typeof spec.prompt === 'string' ? spec.prompt : '';
  const promptFile = /^file:\/\/\S+$/.test(prompt.trim()) ? prompt.trim().slice('file://'.length) : '';
  return (
    <Stack spacing={2}>
      <TextField size="small" label="Name" value={spec.name ?? id} disabled
        helperText={`Kiro starts this agent by this name. It is saved as ${id}.${format}.`} />
      <TextField size="small" label="Description" multiline minRows={2} value={spec.description ?? ''}
        onChange={(e) => onChange(setField(spec, 'description', e.target.value, { keepEmpty: 'description' in spec }))} />
      <TextField label="System prompt" multiline minRows={5} maxRows={18} value={prompt}
        onChange={(e) => onChange(setField(spec, 'prompt', e.target.value, { keepEmpty: 'prompt' in spec }))}
        helperText={format === 'md' ? 'In a Markdown agent, the prompt is the body of the file.' : 'Type the prompt, or enter file:// followed by the path of a prompt file.'}
        slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 13 } } }} />
      {promptFile && <Alert severity="info" variant="outlined">The prompt is read from {promptFile}.</Alert>}
      {format !== 'md' && (
        <Stack direction="row">
          <BrowseButton label="Use a prompt file…" extensions={['md', 'txt']} initialPath={promptFile}
            onPick={(path) => onChange(setField(spec, 'prompt', `file://${path}`))} />
        </Stack>
      )}
    </Stack>
  );
}
