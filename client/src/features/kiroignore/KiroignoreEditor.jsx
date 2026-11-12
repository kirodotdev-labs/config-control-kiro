/**
 * @fileoverview Edits a Kiroignore file: gitignore-style patterns for files
 * Kiro must never read (kiro.dev/docs/kiroignore). Global is
 * ~/.kiro/settings/kiroignore; a Workspace has .kiroignore in the project
 * root, and any subfolder can add its own.
 */
import { useCallback } from 'react';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { VisibilityOff } from '@mui/icons-material';
import { useFileText, useSaveFile } from '../../data/useFiles';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { errorMessage } from '../../data/errors';
import useDraft from '../../hooks/useDraft';
import { useEditorGuard } from '../../contexts/UnsavedChangesContext';
import { KIROIGNORE_TEMPLATE, ignorePatterns } from '../../domain/kiroignore.js';
import { EditorFrame, EditStatus, SaveButton } from '../../ui/EditorFrame';
import { CodeEditor } from '../../ui/CodeEditor';
import { ErrorState, Loading } from '../../ui/States';
import { useNotify } from '../../ui/NotifyProvider';

/** @param {{path: string, exists: boolean, sub?: boolean}} props sub: a subfolder's file. */
export function KiroignoreEditor({ path, exists, sub = false }) {
  const file = useFileText(path, exists);
  const missing = !file.data && (!exists || file.error?.response?.status === 404);
  if (exists && file.isLoading) return <Loading />;
  if (file.isError && !missing) return <ErrorState message={errorMessage(file.error)} onRetry={file.refetch} />;
  return <IgnoreForm key={path} path={path} loaded={missing ? undefined : (file.data?.content ?? '')} sub={sub} />;
}

function IgnoreForm({ path, loaded, sub }) {
  const { isWorkspaceMode } = useWorkspace();
  const save = useSaveFile();
  const notify = useNotify();
  const isNew = loaded === undefined;
  const { draft, setDraft, dirty, markSaved } = useDraft(loaded ?? '', path);
  const count = ignorePatterns(draft).length;

  const onSave = useCallback(() => {
    const content = draft.endsWith('\n') || !draft ? draft : `${draft}\n`;
    save.mutate({ path, content }, {
      onSuccess: () => { markSaved(content); notify('Saved. New Kiro chats skip these files.', 'success'); },
      onError: (e) => notify(errorMessage(e), 'error'),
    });
  }, [save, path, draft, markSaved, notify]);
  useEditorGuard({ dirty, canSave: dirty && !save.isPending, onSave });

  const scope = sub ? 'files in this folder and below'
    : isWorkspaceMode ? 'files in this project' : 'files in every project on this computer';
  return (
    <EditorFrame icon={<VisibilityOff />} title={sub ? path.split(/[\\/]/).slice(-2).join('/') : 'Kiroignore'} path={path}
      status={<EditStatus dirty={dirty} isNew={isNew} />}
      actions={<SaveButton dirty={dirty} saving={save.isPending} onClick={onSave} />}>
      <Box sx={{ p: 2, pb: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Typography variant="body2" color="text.secondary">
          Kiro won&apos;t read {scope} that match these patterns, and leaves them out of search results. Use it for secrets, keys
          and anything you don&apos;t want sent to a model. The syntax is the same as .gitignore: <code>*.pem</code>,{' '}
          <code>secrets/</code>, and <code>!</code> to bring a file back. {count} pattern{count === 1 ? '' : 's'}.
        </Typography>
        <Alert severity="info" variant="outlined">
          Kiro CLI V3 and the Kiro IDE honour this file{isWorkspaceMode && !sub ? ', together with the Global kiroignore and any .kiroignore in a subfolder' : ''}.
          {isWorkspaceMode && !sub ? ' A subfolder\'s .kiroignore wins for files inside it.' : ''} CLI 2.x chats don&apos;t use it.
        </Alert>
        {isNew && !draft && (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography variant="body2">This file doesn&apos;t exist yet.</Typography>
            <Button size="small" variant="outlined" onClick={() => setDraft(KIROIGNORE_TEMPLATE)}>Start with common secrets</Button>
          </Stack>
        )}
      </Box>
      <Box sx={{ flexGrow: 1, minHeight: 0, m: 2 }}><CodeEditor value={draft} onChange={setDraft} language="text" /></Box>
    </EditorFrame>
  );
}
