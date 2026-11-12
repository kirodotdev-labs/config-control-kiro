/**
 * @fileoverview Edits a standalone hook file (.kiro/hooks/*.json,
 * {version: "v1", hooks: [...]}) with a form beside the raw JSON. A file
 * that is not valid JSON opens in the text editor instead.
 */
import { useCallback, useState } from 'react';
import { Alert, Box, Typography } from '@mui/material';
import { Webhook } from '@mui/icons-material';
import { useFileText, useSaveFile } from '../../data/useFiles';
import { useMcpConfig } from '../../data/useMcp';
import { errorMessage } from '../../data/errors';
import useJsonDocument from '../../hooks/useJsonDocument';
import { useEditorGuard } from '../../contexts/UnsavedChangesContext';
import { hookList, hookError } from '../../domain/hooks.js';
import { isObject, parseJson, formatJson } from '../../domain/json.js';
import { EditorFrame, EditStatus, SaveButton } from '../../ui/EditorFrame';
import { CodeEditor } from '../../ui/CodeEditor';
import { SplitPane } from '../../ui/SplitPane';
import { Loading, ErrorState } from '../../ui/States';
import { useNotify } from '../../ui/NotifyProvider';
import { FileEditor } from '../files/FileEditor';
import { baseName } from '../files/paths';
import { DeleteFileButton } from '../files/DeleteFileButton';
import { HookList } from './HookList';

const validate = (v) => (isObject(v) && Array.isArray(v.hooks) ? '' : 'A hook file is an object with a "hooks" array');

/** @param {{path: string, onDeleted: () => void}} props */
export function HookFileEditor({ path, onDeleted }) {
  const file = useFileText(path);
  if (file.isLoading) return <Loading />;
  if (file.isError) return <ErrorState message={errorMessage(file.error)} onRetry={file.refetch} />;
  const { value } = parseJson(file.data.content);
  if (validate(value)) {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Alert severity="warning" sx={{ m: 2, mb: 0 }}>This file isn&apos;t a valid V3 hook file, so it opens as plain text.</Alert>
        <Box sx={{ flexGrow: 1, minHeight: 0 }}><FileEditor path={path} deletable={{ path, label: baseName(path) }} onDeleted={onDeleted} /></Box>
      </Box>
    );
  }
  return <HookFileForm path={path} loaded={value} onDeleted={onDeleted} />;
}

function HookFileForm({ path, loaded, onDeleted }) {
  const save = useSaveFile();
  const notify = useNotify();
  const servers = Object.keys(useMcpConfig().data?.config?.mcpServers || {});
  const { doc, setDoc, text, setText, error, dirty, markSaved } = useJsonDocument(loaded, path, validate);
  const hooks = hookList(doc.hooks);
  const invalid = error || hooks.map(hookError).find(Boolean) || '';
  const [focus, setFocus] = useState(-1); // the hook shown in the JSON
  const [reveal, setReveal] = useState({ index: -1, n: 0 });
  const onCursorKey = useCallback(([top, index]) => {
    if (top !== 'hooks' || typeof index !== 'number') return;
    setFocus(index);
    setReveal((r) => ({ index, n: r.n + 1 }));
  }, []);

  const onSave = useCallback(() => {
    save.mutate({ path, content: `${formatJson(doc)}\n` }, {
      onSuccess: () => { markSaved(doc); notify('Hooks saved', 'success'); },
      onError: (e) => notify(errorMessage(e), 'error'),
    });
  }, [save, path, doc, markSaved, notify]);
  useEditorGuard({ dirty, canSave: dirty && !invalid && !save.isPending, onSave });

  return (
    <EditorFrame
      icon={<Webhook />} title={baseName(path)} path={path}
      status={<EditStatus dirty={dirty} error={invalid} />}
      actions={<>
        <DeleteFileButton target={{ path, label: baseName(path) }} onDeleted={onDeleted} beforeDelete={() => markSaved(doc)} />
        <SaveButton dirty={dirty} valid={!invalid} saving={save.isPending} onClick={onSave} />
      </>}
    >
      <SplitPane
        persistKey="hookfile"
        left={(
          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body2" color="text.secondary">
              The hooks in this file run for every agent in this scope, in both the Kiro IDE and Kiro CLI V3.
            </Typography>
            <HookList hooks={hooks} serverNames={servers} onChange={(next) => setDoc({ ...doc, hooks: next })} onFocus={setFocus} active={focus} reveal={reveal} />
          </Box>
        )}
        right={<CodeEditor value={text} onChange={setText} highlightKey={focus >= 0 && focus < hooks.length ? ['hooks', focus] : ''} onCursorKey={onCursorKey} />}
      />
    </EditorFrame>
  );
}
