/**
 * @fileoverview Standard loading, error, empty and hint states, so every view
 * looks and behaves the same while data is not ready.
 */
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { ErrorOutlined } from '@mui/icons-material';

/** Fills the pane and centres its content. */
export const Centered = ({ children }) => (
  <Box sx={{ height: '100%', minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
    <Stack spacing={1.5} sx={{ alignItems: "center", maxWidth: 460, textAlign: 'center' }}>{children}</Stack>
  </Box>
);

/** @param {{label?: string}} props */
export const Loading = ({ label = 'Loading…' }) => (
  <Centered>
    <CircularProgress size={28} />
    <Typography variant="body2" color="text.secondary">{label}</Typography>
  </Centered>
);

/** @param {{title?: string, message: string, onRetry?: () => void, action?: React.ReactNode}} props */
export const ErrorState = ({ title = 'Could not load this', message, onRetry, action }) => (
  <Centered>
    <ErrorOutlined color="error" />
    <Typography variant="subtitle1">{title}</Typography>
    <Typography variant="body2" color="text.secondary">{message}</Typography>
    <Stack direction="row" spacing={1}>
      {onRetry && <Button variant="outlined" onClick={onRetry}>Try again</Button>}
      {action}
    </Stack>
  </Centered>
);

/** @param {{icon?: React.ReactNode, title: string, body?: string, action?: React.ReactNode}} props */
export const EmptyState = ({ icon, title, body, action }) => (
  <Centered>
    {icon}
    <Typography variant="h6" color="text.secondary">{title}</Typography>
    {body && <Typography variant="body2" color="text.secondary">{body}</Typography>}
    {action}
  </Centered>
);

/** A quiet one-line message for an empty pane. */
export const Hint = ({ text }) => (
  <Centered><Typography color="text.secondary">{text}</Typography></Centered>
);
