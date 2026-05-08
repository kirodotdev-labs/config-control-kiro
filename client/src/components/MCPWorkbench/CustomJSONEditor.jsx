/**
 * @fileoverview Custom JSON editor with syntax highlighting for MCP server configuration.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import UniversalPathBrowser from '../common/UniversalPathBrowser';
import { 
  Box, 
  Typography, 
  Button, 
  Chip,
  Alert,
  useTheme,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Stack,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  FormLabel,
  InputAdornment
} from '@mui/material';
import { Terminal, Save } from '@mui/icons-material';
import JSONEditor from '../../components/common/JSONEditor';
import LaunchDialog from '../Launcher/LaunchDialog';
import useSaveGuard from '../../hooks/useSaveGuard';

const CustomJSONEditor = ({ 
  config, 
  onConfigChange, 
  onSave, 
  selectedServer,
  onServerAdd,
  configFilePath,
  scope,
  workspacePath,
  workingDirectory
}) => {
  const theme = useTheme();
  
  const [isValid, setIsValid] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [addServerDialog, setAddServerDialog] = useState(false);
  const [launchDialog, setLaunchDialog] = useState(false);
  const [lastSavedConfig, setLastSavedConfig] = useState(config);
  const [newServer, setNewServer] = useState({
    name: '',
    command: 'uvx',
    args: [''],
    env: {}
  });
  const editorRef = useRef();
  
  // Update editor content when config changes (profile switch)
  useEffect(() => {
    if (editorRef.current && editorRef.current.setValue) {
      const newValue = JSON.stringify(config, null, 2);
      editorRef.current.setValue(newValue);
    }
  }, [config]);

  // Reset lastSavedConfig on profile/scope switch
  useEffect(() => {
    setLastSavedConfig(config);
  }, [scope]);

  const isDirty = config && lastSavedConfig && JSON.stringify(config) !== JSON.stringify(lastSavedConfig);

  const { isSaving, handleSave } = useSaveGuard({
    isDirty,
    isValid,
    onSave: async () => {
      await onSave(config);
      setLastSavedConfig(config);
    }
  });

  // Handle JSON changes with validation
  const handleJsonChange = useCallback((value) => {
    try {
      const parsed = JSON.parse(value);
      setIsValid(true);
      setErrorMessage('');
      onConfigChange(parsed);
    } catch (error) {
      setIsValid(false);
      setErrorMessage(error.message);
    }
  }, [onConfigChange]);

  // Server management functions
  const handleAddServer = () => {
    setAddServerDialog(true);
  };

  const handleSaveNewServer = () => {
    if (!newServer.name.trim()) return;
    
    const serverConfig = {
      name: newServer.name.toLowerCase().replace(/\s+/g, '-'),
      command: newServer.command,
      args: newServer.args.filter(arg => arg.trim()),
      env: newServer.env,
      enabled: false
    };
    
    onServerAdd(serverConfig);
    setAddServerDialog(false);
    setNewServer({ name: '', command: 'uvx', args: [''], env: {} });
  };

  const updateNewServerArg = (index, value) => {
    const newArgs = [...newServer.args];
    newArgs[index] = value;
    setNewServer(prev => ({ ...prev, args: newArgs }));
  };

  const addNewServerArg = () => {
    setNewServer(prev => ({ ...prev, args: [...prev.args, ''] }));
  };

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', position: 'sticky', top: 0, zIndex: 10 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} sx={{ flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ minWidth: 0, flex: '1 1 auto' }}>
            <Typography variant="h6">MCP Configuration</Typography>
            <Typography 
              variant="caption" 
              color="text.secondary" 
              sx={{ 
                fontFamily: 'monospace',
                display: 'block',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {configFilePath}
            </Typography>
          </Box>
          
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
            {isDirty && !isSaving && (
              <Chip label="Unsaved" color="warning" size="small" variant="outlined" />
            )}
            {isSaving && (
              <Chip label="Saving..." color="info" size="small" />
            )}

            <Button
              variant="contained"
              startIcon={<Save />}
              onClick={handleSave}
              disabled={!isDirty || !isValid || isSaving}
              size="small"
            >
              Save
            </Button>
            
            <Button
              variant="outlined"
              startIcon={<Terminal />}
              onClick={() => setLaunchDialog(true)}
              size="small"
            >
              Terminal
            </Button>
          </Stack>
        </Stack>
        
        <Alert severity={isValid ? 'success' : 'error'} sx={{ mt: 1 }}>
          {isValid ? '✓ Valid JSON' : errorMessage}
        </Alert>

        {selectedServer && (
          <Alert severity="info" sx={{ mt: 1 }}>
            Editing server: <strong>{selectedServer}</strong>
          </Alert>
        )}
      </Box>

      {/* JSON Editor */}
      <Box sx={{ flex: 1, p: 2, overflow: 'hidden' }}>
        <Box 
          sx={{ 
            height: '100%', 
            border: 1, 
            borderColor: selectedServer ? 'primary.main' : 'divider',
            borderRadius: 1,
            overflow: 'auto' // Enable scrollbars
          }}
        >
          <JSONEditor
            ref={editorRef}
            mode="editable"
            value={JSON.stringify(config, null, 2)}
            onChange={handleJsonChange}
            highlightServer={selectedServer}
            onFocusChange={() => {}}
            onCursorChange={() => {}}
            height="100%"
          />
        </Box>
      </Box>

      {/* Add Server Dialog */}
      <Dialog open={addServerDialog} onClose={() => setAddServerDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add New MCP Server</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Server Name"
            value={newServer.name}
            onChange={(e) => setNewServer(prev => ({ ...prev, name: e.target.value }))}
            margin="normal"
            placeholder="e.g., my-custom-server"
          />
          
          <TextField
            fullWidth
            label="Command"
            value={newServer.command}
            onChange={(e) => setNewServer(prev => ({ ...prev, command: e.target.value }))}
            margin="normal"
            placeholder="e.g., uvx, npx, python"
          />
          
          <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Arguments</Typography>
          {newServer.args.map((arg, index) => (
            <Stack key={index} direction="row" spacing={1} sx={{ mb: 1 }}>
              <TextField
                fullWidth
                size="small"
                value={arg}
                onChange={(e) => updateNewServerArg(index, e.target.value)}
                placeholder={`Argument ${index + 1}`}
              />
              <Button
                variant="outlined"
                size="small"
                onClick={() => removeNewServerArg(index)}
                disabled={newServer.args.length === 1}
              >
                Remove
              </Button>
            </Stack>
          ))}
          <Button variant="outlined" size="small" onClick={addNewServerArg}>
            Add Argument
          </Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddServerDialog(false)}>Cancel</Button>
          <Button onClick={handleSaveNewServer} variant="contained" disabled={!newServer.name.trim()}>
            Add Server
          </Button>
        </DialogActions>
      </Dialog>

      <LaunchDialog
        open={launchDialog}
        onClose={() => setLaunchDialog(false)}
        command="kiro-cli chat"
        title="Launch Kiro CLI"
      />

    </Box>
  );
};

export default CustomJSONEditor;
