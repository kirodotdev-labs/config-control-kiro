/**
 * @fileoverview The frame every editor uses: a header with title, file path,
 * save state and actions, above a body that fills the remaining height.
 */
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import { Save as SaveIcon } from '@mui/icons-material';
import { SURFACE } from '../theme';

/**
 * @param {Object} props
 * @param {React.ReactNode} [props.icon]
 * @param {string} props.title
 * @param {string} [props.path] file the editor writes, shown under the title.
 * @param {React.ReactNode} [props.status] chips next to the title.
 * @param {React.ReactNode} [props.actions] buttons on the right.
 * @param {React.ReactNode} props.children
 */
export function EditorFrame({ icon, title, path, status, actions, children }) {
  return (
    <Box sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Stack
        direction="row" spacing={2}
        sx={{ alignItems: "center", px: 3, py: 1.5, borderBottom: `1px solid ${SURFACE.border}`, flexShrink: 0 }}
      >
        {icon && <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>}
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Stack sx={{ alignItems: "center" }} direction="row" spacing={1}>
            <Typography variant="h6" noWrap>{title}</Typography>
            {status}
          </Stack>
          {path && (
            <Typography variant="caption" color="text.secondary" noWrap title={path}
              sx={{ display: 'block', fontFamily: 'monospace' }}>
              {path}
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexShrink: 0 }}>{actions}</Stack>
      </Stack>
      <Box sx={{ flexGrow: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </Box>
    </Box>
  );
}

/**
 * Save button with the app's standard enablement rules.
 * @param {{dirty: boolean, valid?: boolean, saving: boolean, onClick: () => void}} props
 */
export function SaveButton({ dirty, valid = true, saving, onClick }) {
  return (
    <Button
      variant="contained" startIcon={<SaveIcon />} onClick={onClick}
      disabled={!dirty || !valid || saving}
      title={valid ? 'Save (Ctrl+S)' : 'Fix the errors before saving'}
    >
      {saving ? 'Saving…' : 'Save'}
    </Button>
  );
}

/**
 * Chips summarising an editor's state.
 * @param {{dirty: boolean, error?: string, isNew?: boolean}} props
 */
export function EditStatus({ dirty, error, isNew }) {
  return (
    <>
      {isNew && <Chip size="small" variant="outlined" label="new file" />}
      {error && <Chip size="small" color="error" variant="outlined" label="invalid" title={error} />}
      {dirty && !error && <Chip size="small" color="warning" variant="outlined" label="unsaved" />}
    </>
  );
}
