/**
 * @fileoverview Dialog for launching commands in the terminal with workspace context.
 */
import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, FormControl, FormLabel, RadioGroup,
  FormControlLabel, Radio, InputAdornment, Box, Typography,
  IconButton
} from '@mui/material';
import { ContentCopy, Check } from '@mui/icons-material';
import UniversalPathBrowser from '../common/UniversalPathBrowser';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useQuery } from 'react-query';
import { fetchWithAuth, getSystemInfo } from '../../services/api';

const LaunchDialog = ({ open, onClose, command, title = 'Launch in Terminal' }) => {
  const { isWorkspaceMode, activeWorkspace } = useWorkspace();
  const [dirOption, setDirOption] = useState('home');
  const [customDir, setCustomDir] = useState('');
  const [copied, setCopied] = useState(false);

  const { data: sysInfo } = useQuery('system-info', () => getSystemInfo(), { staleTime: Infinity });
  const isWindows = sysInfo?.platform === 'windows' && !sysInfo?.isWSL;

  const getDirectory = () => {
    if (dirOption === 'home') return '~';
    if (dirOption === 'workspace') return activeWorkspace;
    return customDir || '~';
  };

  const fullCommand = isWindows
    ? `cd ${getDirectory()}; ${command}`
    : `cd ${getDirectory()} && ${command}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(fullCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleLaunch = async () => {
    try {
      await fetchWithAuth('/api/launcher/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: getDirectory(), command })
      });
    } catch (error) {
      console.error('Failed to launch:', error);
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <FormControl component="fieldset" sx={{ mt: 2 }}>
          <FormLabel component="legend">Working Directory</FormLabel>
          <RadioGroup value={dirOption} onChange={(e) => setDirOption(e.target.value)}>
            <FormControlLabel value="home" control={<Radio />} label="Home Directory (~)" />
            {isWorkspaceMode && activeWorkspace && (
              <FormControlLabel value="workspace" control={<Radio />} label={`Workspace (${activeWorkspace})`} />
            )}
            <FormControlLabel value="custom" control={<Radio />} label="Custom Directory" />
          </RadioGroup>
        </FormControl>

        {dirOption === 'custom' && (
          <TextField
            fullWidth
            size="small"
            value={customDir}
            onChange={(e) => setCustomDir(e.target.value)}
            placeholder="Enter directory path..."
            sx={{ mt: 2 }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <UniversalPathBrowser
                    label=""
                    title="Select Directory"
                    onSelect={(fileUri) => setCustomDir(fileUri.replace('file://', ''))}
                    buttonProps={{ size: "small", sx: { minWidth: 'auto', p: 0.5 } }}
                  />
                </InputAdornment>
              ),
            }}
          />
        )}

        <Box sx={{ mt: 3 }}>
          <Typography variant="caption" color="text.secondary">Or copy and run in your own terminal:</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5, bgcolor: 'action.hover', borderRadius: 1, px: 1.5, py: 1 }}>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}>
              {fullCommand}
            </Typography>
            <IconButton size="small" onClick={handleCopy} sx={{ ml: 1 }}>
              {copied ? <Check fontSize="small" color="success" /> : <ContentCopy fontSize="small" />}
            </IconButton>
          </Box>
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
