/**
 * @fileoverview Edits mcp.json for the active scope: the server list on the
 * left (with live tools), the file's JSON on the right. A file that is not
 * valid JSON is offered in the text editor so it can be repaired.
 */
import { useCallback, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Storage } from '@mui/icons-material';
import { useMcpConfig, useSaveMcpConfig } from '../../data/useMcp';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { errorMessage } from '../../data/errors';
import useJsonDocument from '../../hooks/useJsonDocument';
import { useEditorGuard } from '../../contexts/UnsavedChangesContext';
import { isObject } from '../../domain/json.js';
import { EditorFrame, EditStatus, SaveButton } from '../../ui/EditorFrame';
import { CodeEditor } from '../../ui/CodeEditor';
import { SplitPane } from '../../ui/SplitPane';
import { Loading, ErrorState } from '../../ui/States';
import { useNotify } from '../../ui/NotifyProvider';
import { FileEditor } from '../files/FileEditor';
import { TerminalButton } from '../launcher/TerminalButton';
import { ServerList } from './ServerList';

const validate = (v) => (isObject(v) && (v.mcpServers === undefined || isObject(v.mcpServers)) ? '' : '"mcpServers" must be an object');

/** @param {{server?: string}} props server to open, when one was selected in the navigator. */
export function McpWorkbench({ server }) {
  const query = useMcpConfig();
  const { configPath } = useWorkspace();
  const [repair, setRepair] = useState(false);
  if (query.isLoading) return <Loading />;
  if (repair) {
    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ px: 3, pt: 1.5 }}>
          <Button onClick={() => { setRepair(false); query.refetch(); }}>Back to servers</Button>
        </Box>
        <Box sx={{ flexGrow: 1, minHeight: 0 }}><FileEditor path={`${configPath}/settings/mcp.json`} title="mcp.json" /></Box>
      </Box>
    );
  }
  if (query.isError) {
    const invalid = query.error?.response?.data?.code === 'MCP_CONFIG_INVALID';
    return (
      <ErrorState title="mcp.json could not be read" message={errorMessage(query.error)} onRetry={query.refetch}
        action={invalid && <Button variant="contained" onClick={() => setRepair(true)}>Open as text to fix it</Button>} />
    );
  }
  return <McpEditor doc={query.data} server={server} />;
}

function McpEditor({ doc, server }) {
  const save = useSaveMcpConfig();
  const notify = useNotify();
  const [focus, setFocus] = useState(server || '');
  const [reveal, setReveal] = useState({ name: '', n: 0 }); // the server the JSON cursor asked to open
  const onCursorKey = useCallback(([top, name]) => {
    if (top !== 'mcpServers' || !name) return;
    setFocus(name);
    setReveal((r) => ({ name, n: r.n + 1 }));
  }, []);
  const { doc: config, setDoc, text, setText, error, dirty, markSaved } = useJsonDocument(doc.config, doc.path, validate);

  const onSave = useCallback(() => {
    save.mutate(config, {
      onSuccess: () => { markSaved(config); notify('MCP servers saved', 'success'); },
      onError: (e) => notify(errorMessage(e), 'error'),
    });
  }, [save, config, markSaved, notify]);
  useEditorGuard({ dirty, canSave: dirty && !error && !save.isPending, onSave });

  return (
    <EditorFrame
      icon={<Storage />} title="MCP servers" path={doc.path}
      status={<EditStatus dirty={dirty} error={error} isNew={!doc.exists} />}
      actions={(
        <>
          <SaveButton dirty={dirty} valid={!error} saving={save.isPending} onClick={onSave} />
          <TerminalButton disabledReason={dirty ? 'Save your changes first, so Kiro starts with these servers.' : ''} />
        </>
      )}
    >
      <SplitPane
        persistKey="mcp"
        left={(
          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body2" color="text.secondary">
              These servers are available to every agent in this scope that has &quot;Also use the servers in
              mcp.json&quot; turned on. Expand a server to edit it and see its tools.
            </Typography>
            <ServerList servers={config.mcpServers || {}} onFocusServer={setFocus} openServer={server} reveal={reveal} activeServer={focus}
              onChange={(next) => setDoc({ ...config, mcpServers: next })} />
          </Box>
        )}
        right={<CodeEditor value={text} onChange={setText} highlightKey={focus ? ['mcpServers', focus] : ''} onCursorKey={onCursorKey} />}
      />
    </EditorFrame>
  );
}
