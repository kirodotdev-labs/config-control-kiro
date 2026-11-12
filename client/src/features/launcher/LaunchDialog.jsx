/**
 * @fileoverview Starts a Kiro CLI V3 chat in a native terminal: choose the
 * working directory (the active workspace, home, or any folder), start a new
 * conversation, resume one, or start a cloud session, then Launch, or copy
 * the command to run it in a terminal of your own.
 */
import { useEffect, useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  FormControl, FormControlLabel, FormLabel, Radio, RadioGroup, Stack,
} from '@mui/material';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useSystemInfo } from '../../data/useSystem';
import { useLaunch } from '../../data/useLaunch';
import { useKiroStatus, kiroBlocker } from '../../data/useKiro';
import { errorMessage } from '../../data/errors';
import { chatCommand, withDirectory } from '../../domain/launch.js';
import { useNotify } from '../../ui/NotifyProvider';
import { PathInput } from '../files/PathInput';
import { BrowseButton } from '../files/BrowseButton';
import { LaunchV2Note } from '../v2/LaunchV2Note';
import { CommandPreview } from './CommandPreview';

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} [props.agentId] start the chat with this agent.
 * @param {Object} [props.v3] 2.x: the agent's V3 readiness, for the note on agents with CLI 2.x settings.
 * @param {boolean} [props.v2] 2.x: start the chat with the CLI 2.x engine.
 * @param {string} [props.title]
 * @param {boolean} [props.cloud] open with "Cloud session" chosen.
 * @param {React.ReactNode} [props.hint] what to do once the chat opens, e.g. the command to run.
 */
export function LaunchDialog({ open, onClose, agentId, v3, v2 = false, title = 'Open in terminal', cloud = false, hint }) {
  const { isWorkspaceMode, activeWorkspace } = useWorkspace();
  const { data: info } = useSystemInfo();
  const launch = useLaunch();
  const { data: status } = useKiroStatus();
  const blocker = kiroBlocker(status, 'chat');
  const signedOut = status?.installed && !status.signedIn;
  const notify = useNotify();
  const [where, setWhere] = useState('home');
  const [customDir, setCustomDir] = useState('');
  const [mode, setMode] = useState('new'); // new | resume | cloud
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setWhere(isWorkspaceMode ? 'workspace' : 'home'); setMode(cloud ? 'cloud' : 'new'); setError(''); }
  }, [open, isWorkspaceMode, cloud]);

  const directory = where === 'workspace' ? activeWorkspace : where === 'custom' ? customDir.trim() : '~';
  const powershell = info?.platform === 'windows' && !info?.isWSL;
  const command = chatCommand({ agentId, resume: mode === 'resume', cloud: mode === 'cloud', v2 });

  const onLaunch = () => {
    if (where === 'custom' && !directory) { setError('Choose a folder first.'); return; }
    setError('');
    launch.mutate({ directory, command }, {
      onSuccess: () => { notify('Terminal opened', 'success'); onClose(); },
      onError: (e) => setError(errorMessage(e)),
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {blocker && <Alert severity="error">{blocker}</Alert>}
        {!blocker && signedOut && (
          <Alert severity="warning">You aren&apos;t signed in to Kiro. The terminal will ask you to sign in before the chat starts.</Alert>
        )}
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
        {hint && <Alert severity="info" variant="outlined">{hint}</Alert>}
        {agentId && mode !== 'resume' && !v2 && <LaunchV2Note v3={v3} agentId={agentId} /> /* 2.x */}
        {v2 && <Alert severity="info">This chat uses Kiro CLI 2.x, which runs the agent exactly as it is. Kiro removes 2.x in January.</Alert> /* 2.x */}
        <FormControl>
          <FormLabel>Working directory</FormLabel>
          <RadioGroup value={where} onChange={(e) => { setWhere(e.target.value); setError(''); }}>
            {isWorkspaceMode && <FormControlLabel value="workspace" control={<Radio />} label={`Workspace (${activeWorkspace})`} />}
            <FormControlLabel value="home" control={<Radio />} label="Home (~)" />
            <FormControlLabel value="custom" control={<Radio />} label="Another folder" />
          </RadioGroup>
        </FormControl>
        {agentId && isWorkspaceMode && where !== 'workspace' && (
          <Alert severity="info">
            {agentId} is a workspace agent, so Kiro finds it only when the chat starts in {activeWorkspace} or a folder inside it.
          </Alert>
        )}
        {where === 'custom' && (
          <Stack sx={{ alignItems: "flex-start" }} direction="row" spacing={1}>
            <PathInput
              value={customDir} onChange={setCustomDir} autoFocus
              onResolve={(r) => r.valid && r.exists && setCustomDir(r.type === 'directory' ? r.resolvedPath : r.parentPath)}
            />
            <BrowseButton mode="directory" initialPath={customDir} onPick={setCustomDir} />
          </Stack>
        )}
        <FormControl>
          <FormLabel>Conversation</FormLabel>
          <RadioGroup row value={mode} onChange={(e) => setMode(e.target.value)}>
            <FormControlLabel value="new" control={<Radio />} label="Start new" />
            <FormControlLabel value="resume" control={<Radio />} label="Resume a previous one" />
            {!v2 && <FormControlLabel value="cloud" control={<Radio />} label="Cloud session" />}
          </RadioGroup>
        </FormControl>
        {mode === 'cloud' && (
          <Alert severity="info">
            The chat runs in a Kiro cloud sandbox and keeps running after you close the terminal; resume it from any machine. Type /repo in
            the chat to pick a GitHub or GitLab repository. The repository&apos;s committed .kiro files apply; your ~/.kiro stays on this
            computer and does not. Needs a Pro plan or higher.
          </Alert>
        )}
        <Divider />
        <CommandPreview label="Or copy this command and run it yourself" command={withDirectory(directory || '~', command, powershell)} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={onLaunch} disabled={launch.isPending || !!blocker}>
          {launch.isPending ? 'Launching…' : 'Launch'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
