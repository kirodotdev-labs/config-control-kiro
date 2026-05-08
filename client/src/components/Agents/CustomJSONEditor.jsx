/**
 * @fileoverview Custom JSON editor with syntax highlighting for agent configuration.
 */
import React, { useState, useCallback, useRef, useEffect, useImperativeHandle } from 'react';
import { useWorkspace } from '../../contexts/WorkspaceContext';
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
import { PlayArrow, Person, Terminal, Save } from '@mui/icons-material';
import JSONEditor from '../../components/common/JSONEditor';
import LaunchDialog from '../Launcher/LaunchDialog';
import { agentService } from '../../services/api';
import useSaveGuard from '../../hooks/useSaveGuard';

const CustomJSONEditor = React.forwardRef(({ 
  agent,
  config, 
  onConfigChange, 
  onNotification,
  highlightedFields = [],
  onAgentChange,
  workingDirectory = ''
}, ref) => {
  const theme = useTheme();
  const { configPath } = useWorkspace();
  
  const [isValid, setIsValid] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [launchDialog, setLaunchDialog] = useState(false);
  const [lastSavedConfig, setLastSavedConfig] = useState(null);
  const editorRef = useRef();

  // Forward editor methods to external ref
  useImperativeHandle(ref, () => ({
    format: () => editorRef.current?.format(),
    focus: () => editorRef.current?.focus(),
    scrollToField: (field) => editorRef.current?.scrollToField(field)
  }));
  const [editorFocused, setEditorFocused] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(null);

  // Preserve focus and cursor position when config changes externally
  useEffect(() => {
    if (editorRef.current && editorFocused && cursorPosition) {
      setTimeout(() => {
        editorRef.current.focus();
        if (editorRef.current.setCursorPosition) {
          editorRef.current.setCursorPosition(cursorPosition);
        }
      }, 10);
    }
  }, [config, editorFocused, cursorPosition]);

  // Handle JSON changes with validation
  const handleJsonChange = useCallback((value) => {
    try {
      const parsed = JSON.parse(value);
      setIsValid(true);
      setErrorMessage('');
      onConfigChange(parsed);
      // Sync with config cards
      if (onAgentChange) {
        onAgentChange(parsed);
      }
    } catch (error) {
      setIsValid(false);
      setErrorMessage(error.message);
    }
  }, [onConfigChange, onAgentChange]);

  // Track dirty state
  const isDirty = agent && lastSavedConfig !== null && JSON.stringify(agent) !== JSON.stringify(lastSavedConfig);

  // Reset lastSavedConfig when agent changes (new agent selected)
  useEffect(() => {
    if (agent) setLastSavedConfig(agent);
  }, [agent?.name]);

  const { isSaving, handleSave } = useSaveGuard({
    isDirty,
    isValid,
    onSave: async () => {
      await agentService.updateAgent(agent.name, config);
      setLastSavedConfig(config);
    }
  });

  // Handle launch in native terminal
  const handleLaunch = () => {
    if (!isValid) return;
    setLaunchDialog(true);
  };

  if (!agent) {
    return (
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="h6" color="text.secondary">
          Select an agent to view and edit its configuration
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', position: 'sticky', top: 0, zIndex: 10 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} sx={{ flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ minWidth: 0, flex: '1 1 auto' }}>
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Person />
              {agent.name}
            </Typography>
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
              {configPath}/agents/{agent.name}.json
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
              disabled={!isValid}
              size="small"
            >
              Terminal
            </Button>
          </Stack>
        </Stack>

        <Alert severity={isValid ? 'success' : 'error'} sx={{ mt: 2 }}>
          {isValid ? '✓ Valid JSON' : <><strong>JSON Error:</strong> {errorMessage}</>}
        </Alert>
      </Box>

      {/* JSON Editor */}
      <Box sx={{ flex: 1, p: 2, overflow: 'hidden' }}>
        <Box sx={{ height: '100%', overflow: 'auto' }}>
          <JSONEditor
            ref={editorRef}
            mode="editable"
            value={JSON.stringify(agent, null, 2)}
            onChange={handleJsonChange}
            onValidationChange={(valid, error) => {
              setIsValid(valid);
              setErrorMessage(error || '');
            }}
            highlightFields={highlightedFields}
            height="100%"
          />
        </Box>
      </Box>

      <LaunchDialog
        open={launchDialog}
        onClose={() => setLaunchDialog(false)}
        command={`kiro-cli chat --agent ${agent?.name || ''}`}
        title="Launch Agent"
      />

    </Box>
  );
});

export default CustomJSONEditor;
