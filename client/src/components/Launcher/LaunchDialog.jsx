/**
 * @fileoverview Dialog for launching commands in the terminal with workspace context.
 *
 * Working Directory ordering:
 *   - When a workspace is active: Workspace (default), Home, Custom
 *   - Otherwise (global mode):    Home (default), Custom
 *
 * Launch Mode (only when showResumePicker is true):
 *   - "Start new conversation [with agent]"  → original `command` is used
 *   - "Resume previous conversation [with agent]" → command gets the
 *     `--resume-picker` flag appended
 *
 * When the resume picker is active two copyable commands are shown so
 * users can grab either flow without flipping the radio first.
 */
import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, FormControl, FormLabel, RadioGroup,
  FormControlLabel, Radio, InputAdornment, Box, Typography,
  IconButton, Alert, Divider
} from '@mui/material';
import { ContentCopy, Check } from '@mui/icons-material';
import UniversalPathBrowser from '../common/UniversalPathBrowser';
import PathInput from '../common/PathInput';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useQuery } from 'react-query';
import { fetchWithAuth, getSystemInfo, resolvePath } from '../../services/api';

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {function} props.onClose
 * @param {string} props.command - Command to run after `cd <dir> &&`.
 * @param {string} [props.title='Launch in Terminal']
 * @param {boolean} [props.hideCustomDirectory=false] - When true, removes
 *   the "Custom Directory" radio option entirely. Useful for commands
 *   like `kiro-cli update` where directory choice is irrelevant.
 * @param {boolean} [props.showResumePicker=false] - When true, renders
 *   the Launch Mode radio group (Start new vs Resume) and two copyable
 *   commands. Only meaningful for `kiro-cli chat ...` launches.
 */
const LaunchDialog = ({
  open,
  onClose,
  command,
  title = 'Launch in Terminal',
  hideCustomDirectory = false,
  showResumePicker = false,
}) => {
  const { isWorkspaceMode, activeWorkspace } = useWorkspace();
  const hasWorkspace = isWorkspaceMode && Boolean(activeWorkspace);

  const [dirOption, setDirOption] = useState(hasWorkspace ? 'workspace' : 'home');
  const [launchMode, setLaunchMode] = useState('new'); // 'new' | 'resume'
  const [customDir, setCustomDir] = useState('');
  const [copiedKey, setCopiedKey] = useState(''); // 'new' | 'resume' | ''
  const [launchError, setLaunchError] = useState('');

  // When the dialog opens (or the workspace context changes while open),
  // reset the directory radio so the most useful option is preselected.
  useEffect(() => {
    if (open) {
      setDirOption(hasWorkspace ? 'workspace' : 'home');
      setLaunchMode('new');
      setLaunchError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hasWorkspace]);

  const { data: sysInfo } = useQuery('system-info', () => getSystemInfo(), { staleTime: Infinity });
  const isWindows = sysInfo?.platform === 'windows' && !sysInfo?.isWSL;

  const getDirectory = () => {
    if (dirOption === 'home') return '~';
    if (dirOption === 'workspace') return activeWorkspace;
    return customDir || '~';
  };

  // The command actually executed depends on the selected launch mode.
  // "Start new" uses the caller-provided command as-is. "Resume" appends
  // the --resume-picker flag to whatever chat command we received.
  const buildCommand = (mode) => {
    if (!showResumePicker || mode === 'new') return command;
    return `${command} --resume-picker`;
  };

  const joinCmd = (cmd) => (isWindows ? `cd ${getDirectory()}; ${cmd}` : `cd ${getDirectory()} && ${cmd}`);

  const fullCommand = joinCmd(buildCommand(launchMode));
  const newCommandPreview = joinCmd(buildCommand('new'));
  const resumeCommandPreview = joinCmd(buildCommand('resume'));

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 1500);
  };

  const handleLaunch = async () => {
    setLaunchError('');
    if (dirOption === 'custom') {
      if (!customDir || !customDir.trim()) {
        setLaunchError('Please enter or select a custom directory.');
        return;
      }
      try {
        const result = await resolvePath(customDir);
        if (!result.valid || result.type !== 'directory') {
          setLaunchError(result.error || 'Custom directory is not a valid directory.');
          return;
        }
      } catch (err) {
        setLaunchError('Could not validate the custom directory.');
        return;
      }
    }
    try {
      await fetchWithAuth('/api/launcher/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: getDirectory(), command: buildCommand(launchMode) }),
      });
    } catch (error) {
      console.error('Failed to launch:', error);
    }
    onClose();
  };

  // Single command box used by the non-resume case.
  const SingleCommandBox = ({ text }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5, bgcolor: 'action.hover', borderRadius: 1, px: 1.5, py: 1 }}>
      <Typography variant="body2" sx={{ fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}>
        {text}
      </Typography>
      <IconButton size="small" onClick={() => handleCopy(text, 'single')} sx={{ ml: 1 }}>
        {copiedKey === 'single' ? <Check fontSize="small" color="success" /> : <ContentCopy fontSize="small" />}
      </IconButton>
    </Box>
  );

  // One row inside the dual command preview used when the resume picker
  // is shown — labelled with the mode so users can grab either command.
  const CommandRow = ({ label, text, copyKey }) => (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', px: 1.5, py: 1 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{label}</Typography>
        <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
          {text}
        </Typography>
      </Box>
      <IconButton size="small" onClick={() => handleCopy(text, copyKey)} sx={{ ml: 1 }}>
        {copiedKey === copyKey ? <Check fontSize="small" color="success" /> : <ContentCopy fontSize="small" />}
      </IconButton>
    </Box>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {launchError && (
          <Alert severity="error" sx={{ mt: 1, mb: 1 }} onClose={() => setLaunchError('')}>
            {launchError}
          </Alert>
        )}

        {/* Working Directory — workspace first when available, else home first. */}
        <FormControl component="fieldset" sx={{ mt: 2 }}>
          <FormLabel component="legend">Working Directory</FormLabel>
          <RadioGroup value={dirOption} onChange={(e) => { setDirOption(e.target.value); setLaunchError(''); }}>
            {hasWorkspace && (
              <FormControlLabel value="workspace" control={<Radio />} label={`Workspace (${activeWorkspace})`} />
            )}
            <FormControlLabel value="home" control={<Radio />} label="Home Directory (~)" />
            {!hideCustomDirectory && (
              <FormControlLabel value="custom" control={<Radio />} label="Custom Directory" />
            )}
          </RadioGroup>
        </FormControl>

        {!hideCustomDirectory && dirOption === 'custom' && (
          <PathInput
            value={customDir}
            onChange={(v) => { setCustomDir(v); if (launchError) setLaunchError(''); }}
            onResolve={(result) => {
              if (result.valid) {
                setCustomDir(result.type === 'directory' ? result.resolvedPath : result.parentPath);
              }
            }}
            placeholder="Paste a path and press Enter (Linux, macOS, or Windows)"
            helperText="Press Enter to validate"
            sx={{ mt: 2 }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <UniversalPathBrowser
                    label="Browse"
                    title="Select Directory"
                    onSelect={(fileUri) => setCustomDir(fileUri.replace('file://', ''))}
                    initialPath={customDir}
                    buttonProps={{ size: "small" }}
                  />
                </InputAdornment>
              ),
            }}
          />
        )}

        {/* Launch Mode — only relevant for chat launches. The radio
            controls which command is launched / used as fullCommand. */}
        {showResumePicker && (
          <>
            <Divider sx={{ my: 2 }} />
            <FormControl component="fieldset">
              <FormLabel component="legend">Launch Mode</FormLabel>
              <RadioGroup value={launchMode} onChange={(e) => setLaunchMode(e.target.value)}>
                <FormControlLabel value="new" control={<Radio />} label="Start new conversation" />
                <FormControlLabel value="resume" control={<Radio />} label="Resume previous conversation" />
              </RadioGroup>
            </FormControl>
          </>
        )}

        <Divider sx={{ my: 2 }} />

        <Box>
          <Typography variant="caption" color="text.secondary">Or copy and run in your own terminal:</Typography>
          {showResumePicker ? (
            <Box sx={{ mt: 0.5, bgcolor: 'action.hover', borderRadius: 1 }}>
              <CommandRow label="Start new" text={newCommandPreview} copyKey="new" />
              <Divider />
              <CommandRow label="Resume" text={resumeCommandPreview} copyKey="resume" />
            </Box>
          ) : (
            <SingleCommandBox text={fullCommand} />
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleLaunch} variant="contained">Launch</Button>
      </DialogActions>
    </Dialog>
  );
};

export default LaunchDialog;
