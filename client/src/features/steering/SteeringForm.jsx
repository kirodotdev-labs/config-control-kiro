/**
 * @fileoverview When Kiro loads a steering file, edited in its front matter:
 * always, when files match, when the request matches, or only when asked.
 * Changes go straight into the file text below it.
 */
import { Alert, Box, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { COMMON_PATTERNS, INCLUSIONS, frontMatterError, parseFrontMatter, setFrontMatter } from '../../domain/steering.js';
import { ListInput } from '../../ui/ListInput';
import { SURFACE } from '../../theme';

/**
 * @param {Object} props
 * @param {string} props.text the whole file.
 * @param {(next: string) => void} props.onChange
 * @param {string} props.fileName e.g. "api-design.md", for the chat hint.
 */
export function SteeringForm({ text, onChange, fileName }) {
  const { fields } = parseFrontMatter(text);
  const set = (key) => (value) => onChange(setFrontMatter(text, key, value));
  const known = INCLUSIONS.find((i) => i.value === fields.inclusion);
  const error = frontMatterError(fields);
  const stem = fileName.replace(/\.md$/i, '');
  return (
    <Box sx={{ p: 2, borderBottom: `1px solid ${SURFACE.border}` }} data-section="inclusion">
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
        <TextField select size="small" label="When Kiro loads it" value={fields.inclusion} sx={{ minWidth: 320 }}
          onChange={(e) => set('inclusion')(e.target.value)}>
          {INCLUSIONS.map((i) => <MenuItem key={i.value} value={i.value}>{i.label}<Box component="span" sx={{ color: 'text.secondary', fontFamily: 'monospace', ml: 1 }}>{i.value}</Box></MenuItem>)}
          {!known && <MenuItem value={fields.inclusion}>{fields.inclusion}</MenuItem>}
        </TextField>
        <Typography variant="body2" color="text.secondary" sx={{ pt: 1 }}>
          {known ? known.hint : ''}
          {fields.inclusion === 'manual' && ` For this file: #${fields.name || stem}.`}
        </Typography>
      </Stack>
      {fields.inclusion === 'fileMatch' && (
        <Box sx={{ mt: 1.5 }}>
          <ListInput label="File patterns (fileMatchPattern)" value={fields.fileMatchPattern} onChange={set('fileMatchPattern')}
            options={COMMON_PATTERNS.map(([g]) => g)} describe={(g) => COMMON_PATTERNS.find(([p]) => p === g)?.[1] || ''}
            placeholder="Pick a glob or type one and press Enter" helperText="Globs, matched against the files Kiro works on. One pattern is saved as a string, several as a list." />
        </Box>
      )}
      {fields.inclusion === 'auto' && (
        <Stack spacing={1.5} sx={{ mt: 1.5 }}>
          <TextField size="small" label="Name" value={fields.name} onChange={(e) => set('name')(e.target.value)} placeholder={stem}
            helperText={`Also a chat command: /${fields.name || stem}`} />
          <TextField size="small" label="Description" value={fields.description} multiline minRows={2}
            onChange={(e) => set('description')(e.target.value)}
            helperText="When Kiro should load it. Kiro matches this against your request, e.g. REST API rules. Use when creating or changing endpoints." />
        </Stack>
      )}
      {error && <Alert severity="warning" sx={{ mt: 1.5 }}>{error}.</Alert>}
    </Box>
  );
}
