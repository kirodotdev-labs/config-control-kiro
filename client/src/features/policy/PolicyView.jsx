/**
 * @fileoverview The administrator permission policy (managed-settings.json),
 * read-only. Only an administrator can change it; its rules can only deny or
 * ask, and they apply on top of everyone's own rules.
 */
import { Alert, Box } from '@mui/material';
import { AdminPanelSettings } from '@mui/icons-material';
import { useFileText } from '../../data/useFiles';
import { errorMessage } from '../../data/errors';
import { parseJson } from '../../domain/json.js';
import { EditorFrame } from '../../ui/EditorFrame';
import { CodeEditor } from '../../ui/CodeEditor';
import { ErrorState, Loading } from '../../ui/States';
import { TrustAndPolicy } from '../permissions/TrustAndPolicy';

/** @param {{path: string}} props */
export function PolicyView({ path }) {
  const file = useFileText(path);
  if (file.isLoading) return <Loading />;
  if (file.isError) return <ErrorState message={errorMessage(file.error)} onRetry={file.refetch} />;
  const text = file.data.content || '';
  const { value, error } = parseJson(text || '{}');
  const rules = Array.isArray(value?.rules) ? value.rules : [];
  return (
    <EditorFrame icon={<AdminPanelSettings />} title="Admin policy" path={path}>
      <Box sx={{ p: 3, pb: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Alert severity="info" variant="outlined">
          This file is deployed by your organization and needs administrator rights to change, so it opens read-only.
          Kiro reads it when it starts. See kiro.dev/docs/enterprise/governance/permissions.
        </Alert>
        <TrustAndPolicy admin={{ path, rules, error: error ? 'The policy file isn\'t valid JSON, so Kiro may not apply it.' : '' }} />
      </Box>
      <Box sx={{ flexGrow: 1, minHeight: 0, m: 2 }}><CodeEditor value={text} readOnly /></Box>
    </EditorFrame>
  );
}
