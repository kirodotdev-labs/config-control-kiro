/**
 * @fileoverview Edits permissions.yaml for the active scope: the form on the
 * left, the file's text on the right, kept in sync. Save writes the text, so
 * comments and other keys in the file are kept.
 */
import { useCallback } from 'react';
import { Alert, Box, Typography } from '@mui/material';
import { Security } from '@mui/icons-material';
import { usePermissions } from '../../data/useSettings';
import { useFileText, useSaveFile } from '../../data/useFiles';
import { errorMessage } from '../../data/errors';
import useTextDocument from '../../hooks/useTextDocument';
import { readPermissions, writePermissions } from '../../domain/permYaml.js';
import { useEditorGuard } from '../../contexts/UnsavedChangesContext';
import { EditorFrame, EditStatus, SaveButton } from '../../ui/EditorFrame';
import { CodeEditor } from '../../ui/CodeEditor';
import { SplitPane } from '../../ui/SplitPane';
import { Loading, ErrorState } from '../../ui/States';
import { useNotify } from '../../ui/NotifyProvider';
import { RulesEditor } from './RulesEditor';
import { TrustAndPolicy } from './TrustAndPolicy';
import { PresetsEditor } from './PresetsEditor';

export function PermissionsEditor() {
  const query = usePermissions();
  const file = useFileText(query.data?.path, !!query.data, true);
  if (query.isLoading || file.isLoading) return <Loading />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={query.refetch} />;
  if (file.isError) return <ErrorState message={errorMessage(file.error)} onRetry={file.refetch} />;
  return <PermissionsBody key={query.data.path} doc={query.data} loaded={file.data?.content ?? ''} />;
}

const EMPTY = { policies: [], rules: [] };
/** permissions.yaml as the form's { policies, rules }. */
const readForm = (text) => {
  const { policies, rules, error } = readPermissions(text);
  return { value: error ? null : { policies, rules }, error };
};

function PermissionsBody({ doc, loaded }) {
  const save = useSaveFile();
  const notify = useNotify();
  const { text, setText, value, setValue: setForm, error, dirty, markSaved } = useTextDocument(loaded, doc.path, readForm, writePermissions);
  const form = value || EMPTY;

  const onSave = useCallback(() => {
    save.mutate({ path: doc.path, content: text }, {
      onSuccess: () => { markSaved(text); notify('Permissions saved', 'success'); },
      onError: (e) => notify(errorMessage(e), 'error'),
    });
  }, [save, doc.path, text, markSaved, notify]);
  useEditorGuard({ dirty, canSave: dirty && !error && !save.isPending, onSave });

  const left = (
    <Box sx={{ overflow: 'auto', p: 3, display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
      <TrustAndPolicy trust={doc.trust} admin={doc.admin} />
      {error && <Alert severity="error" variant="outlined">The YAML has a problem, so the form shows the last good version: {error}</Alert>}
      <Alert severity="info" variant="outlined">
        When rules conflict, <strong>deny</strong> wins over <strong>ask</strong>, <strong>ask</strong> over
        <strong> allow</strong>, and <strong>allow</strong> over <strong>evaluate</strong> (Kiro decides). This applies
        across Global, the Workspace and the agent. Patterns are globs, such as <code>git *</code> or <code>src/**</code>.
      </Alert>
      <PresetsEditor policies={form.policies} onChange={(policies) => setForm({ ...form, policies })} />
      <Typography variant="overline" color="text.secondary">Rules</Typography>
      <RulesEditor rules={form.rules} onChange={(rules) => setForm({ ...form, rules })} />
    </Box>
  );
  return (
    <EditorFrame
      icon={<Security />} title="Permissions" path={doc.path}
      status={<EditStatus dirty={dirty} error={error} isNew={!doc.exists} />}
      actions={<SaveButton dirty={dirty} valid={!error} saving={save.isPending} onClick={onSave} />}
    >
      <SplitPane persistKey="permissions-editor" left={left} right={<CodeEditor value={text} onChange={setText} language="yaml" />} />
    </EditorFrame>
  );
}
