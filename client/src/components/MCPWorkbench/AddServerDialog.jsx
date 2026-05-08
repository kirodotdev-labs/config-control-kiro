/**
 * @fileoverview Dialog for adding a new MCP server configuration.
 */
import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions, 
  Button, 
  Box, 
  Chip,
  TextField,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormLabel,
  IconButton,
  Menu,
  MenuItem,
  Divider,
  Typography,
  Checkbox
} from '@mui/material';
import { 
  Terminal, 
  Add as AddIcon, 
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon 
} from '@mui/icons-material';
import JSONEditor from '../../components/common/JSONEditor';
import ResizableDivider from '../common/ResizableDivider';
import useResizablePanels from '../../hooks/useResizablePanels';

const AddServerDialog = ({
  open,
  onClose,
  newServerJson,
  onJsonChange,
  newServerValid,
  newServerError,
  onConvertToWSL,
  onSubmit,
  isEditing = false
}) => {
  const { leftPanelWidth, isDragging, handleMouseDown } = useResizablePanels(50, 'addServerLeftPanel', 30, 70);
  
  const [serverName, setServerName] = useState('');
  const [serverType, setServerType] = useState('remote');
  
  // Local server fields
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState([]);
  
  // Remote server fields
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState([]);
  
  // Optional known fields
  const [showEnv, setShowEnv] = useState(false);
  const [env, setEnv] = useState([]);
  
  const [showDisabled, setShowDisabled] = useState(false);
  const [disabled, setDisabled] = useState(false);
  
  const [showAutoApprove, setShowAutoApprove] = useState(false);
  const [autoApprove, setAutoApprove] = useState('');
  
  const [showDisabledTools, setShowDisabledTools] = useState(false);
  const [disabledTools, setDisabledTools] = useState('');
  
  // Custom fields
  const [customFields, setCustomFields] = useState([]);
  
  // Add field menu
  const [addFieldAnchor, setAddFieldAnchor] = useState(null);
  
  // Track if we're updating from JSON to avoid loops
  const [updatingFromJson, setUpdatingFromJson] = useState(false);

  // Parse JSON and populate form
  useEffect(() => {
    if (!newServerJson || updatingFromJson) return;
    
    try {
      const parsed = JSON.parse(newServerJson);
      
      // Handle both wrapped and unwrapped formats
      let servers = parsed;
      if (parsed.mcpServers) {
        servers = parsed.mcpServers;
      }
      
      const serverNames = Object.keys(servers);
      if (serverNames.length === 0) return;
      
      const name = serverNames[0];
      const config = servers[name];
      
      // Skip if config is not an object (invalid format)
      if (typeof config !== 'object' || config === null) return;
      
      setUpdatingFromJson(true);
      
      // Set server name
      setServerName(name);
      
      // Determine type and set fields
      if (config.url) {
        setServerType('remote');
        setUrl(config.url || '');
        setHeaders(Object.entries(config.headers || {}).map(([k, v]) => ({ key: k, value: v })));
      } else {
        setServerType('local');
        setCommand(config.command || '');
        setArgs(config.args || []);
      }
      
      // Optional fields
      if (config.env && Object.keys(config.env).length > 0) {
        setShowEnv(true);
        setEnv(Object.entries(config.env).map(([k, v]) => ({ key: k, value: v })));
      } else {
        setShowEnv(false);
        setEnv([]);
      }
      
      if (config.disabled !== undefined) {
        setShowDisabled(true);
        setDisabled(config.disabled);
      } else {
        setShowDisabled(false);
        setDisabled(false);
      }
      
      if (config.autoApprove && config.autoApprove.length > 0) {
        setShowAutoApprove(true);
        setAutoApprove(config.autoApprove.join(', '));
      } else {
        setShowAutoApprove(false);
        setAutoApprove('');
      }
      
      if (config.disabledTools && config.disabledTools.length > 0) {
        setShowDisabledTools(true);
        setDisabledTools(config.disabledTools.join(', '));
      } else {
        setShowDisabledTools(false);
        setDisabledTools('');
      }
      
      // Custom fields (unknown fields)
      const knownFields = ['url', 'command', 'args', 'env', 'headers', 'disabled', 'autoApprove', 'disabledTools'];
      const custom = Object.entries(config)
        .filter(([key]) => !knownFields.includes(key))
        .map(([key, value]) => ({
          key,
          value: typeof value === 'string' ? value : JSON.stringify(value)
        }));
      setCustomFields(custom);
      
      setTimeout(() => setUpdatingFromJson(false), 100);
    } catch (error) {
      // Invalid JSON, don't update form
      setUpdatingFromJson(false);
    }
  }, [newServerJson]);

  // Build JSON from form
  useEffect(() => {
    if (updatingFromJson || !serverName) return;
    
    const config = {};
    
    if (serverType === 'remote') {
      if (url) config.url = url;
      if (headers.length && headers.some(h => h.key && h.value)) {
        config.headers = headers.reduce((acc, { key, value }) => {
          if (key && value) acc[key] = value;
          return acc;
        }, {});
      }
    } else {
      if (command) config.command = command;
      if (args.length && args.some(a => a)) {
        config.args = args.filter(a => a);
      }
    }
    
    if (showEnv && env.length && env.some(e => e.key && e.value)) {
      config.env = env.reduce((acc, { key, value }) => {
        if (key && value) acc[key] = value;
        return acc;
      }, {});
    }
    
    if (showDisabled) config.disabled = disabled;
    
    if (showAutoApprove && autoApprove) {
      config.autoApprove = autoApprove.split(',').map(s => s.trim()).filter(Boolean);
    }
    
    if (showDisabledTools && disabledTools) {
      config.disabledTools = disabledTools.split(',').map(s => s.trim()).filter(Boolean);
    }
    
    // Add custom fields
    customFields.forEach(({ key, value }) => {
      if (key && value) {
        try {
          config[key] = JSON.parse(value);
        } catch {
          config[key] = value;
        }
      }
    });
    
    const json = { [serverName]: config };
    const jsonString = JSON.stringify(json, null, 2);
    
    // Only update if different to avoid loops
    if (jsonString !== newServerJson) {
      onJsonChange(jsonString);
    }
  }, [serverName, serverType, url, command, args, headers, showEnv, env, showDisabled, disabled, showAutoApprove, autoApprove, showDisabledTools, disabledTools, customFields]);

  const handleAddField = (field) => {
    setAddFieldAnchor(null);
    
    switch (field) {
      case 'env':
        setShowEnv(true);
        if (env.length === 0) setEnv([{ key: '', value: '' }]);
        break;
      case 'disabled':
        setShowDisabled(true);
        break;
      case 'autoApprove':
        setShowAutoApprove(true);
        break;
      case 'disabledTools':
        setShowDisabledTools(true);
        break;
      case 'custom':
        setCustomFields([...customFields, { key: '', value: '' }]);
        break;
    }
  };

  const handleClose = () => {
    // Reset all form state
    setServerName('');
    setServerType('remote');
    setCommand('');
    setArgs([]);
    setUrl('');
    setHeaders([]);
    setShowEnv(false);
    setEnv([]);
    setShowDisabled(false);
    setDisabled(false);
    setShowAutoApprove(false);
    setAutoApprove('');
    setShowDisabledTools(false);
    setDisabledTools('');
    setCustomFields([]);
    setUpdatingFromJson(false);
    onClose();
  };

  const handleSubmit = () => {
    onSubmit();
    // Don't reset here - let parent close dialog on success
    // Form will reset when dialog closes via handleClose
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>{isEditing ? 'Edit MCP Server' : 'Add MCP Server'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', gap: 0, height: '600px' }}>
          {/* Left: Form Builder */}
          <Box sx={{ width: `${leftPanelWidth}%`, overflow: 'auto', pr: 1 }}>
            <TextField
              fullWidth
              label="Server Name"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              margin="dense"
              required
              size="small"
            />
            
            <FormLabel component="legend" sx={{ mt: 1, fontSize: '0.875rem' }}>Server Type</FormLabel>
            <RadioGroup row value={serverType} onChange={(e) => setServerType(e.target.value)}>
              <FormControlLabel value="local" control={<Radio size="small" />} label="Local" />
              <FormControlLabel value="remote" control={<Radio size="small" />} label="Remote" />
            </RadioGroup>
            
            {serverType === 'remote' ? (
              <>
                <TextField
                  fullWidth
                  label="URL"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  margin="dense"
                  required
                  size="small"
                />
                
                <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>Headers</Typography>
                {headers.map((header, idx) => (
                  <Box key={idx} sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                    <TextField
                      size="small"
                      label="Key"
                      value={header.key}
                      onChange={(e) => {
                        const newHeaders = [...headers];
                        newHeaders[idx].key = e.target.value;
                        setHeaders(newHeaders);
                      }}
                      sx={{ flex: 1 }}
                    />
                    <TextField
                      size="small"
                      label="Value"
                      value={header.value}
                      onChange={(e) => {
                        const newHeaders = [...headers];
                        newHeaders[idx].value = e.target.value;
                        setHeaders(newHeaders);
                      }}
                      sx={{ flex: 2 }}
                    />
                    <IconButton size="small" onClick={() => setHeaders(headers.filter((_, i) => i !== idx))}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
                <Button
                  startIcon={<AddIcon />}
                  onClick={() => setHeaders([...headers, { key: '', value: '' }])}
                  sx={{ mt: 0.5 }}
                  size="small"
                >
                  Add Header
                </Button>
              </>
            ) : (
              <>
                <TextField
                  fullWidth
                  label="Command"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  margin="dense"
                  required
                  size="small"
                />
                
                <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>Arguments</Typography>
                {args.map((arg, idx) => (
                  <Box key={idx} sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                    <TextField
                      size="small"
                      fullWidth
                      value={arg}
                      onChange={(e) => {
                        const newArgs = [...args];
                        newArgs[idx] = e.target.value;
                        setArgs(newArgs);
                      }}
                    />
                    <IconButton size="small" onClick={() => setArgs(args.filter((_, i) => i !== idx))}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
                <Button
                  startIcon={<AddIcon />}
                  onClick={() => setArgs([...args, ''])}
                  sx={{ mt: 0.5 }}
                  size="small"
                >
                  Add Argument
                </Button>
              </>
            )}
            
            <Divider sx={{ my: 1 }} />
            
            <Button
              variant="outlined"
              endIcon={<ExpandMoreIcon />}
              onClick={(e) => setAddFieldAnchor(e.currentTarget)}
              fullWidth
              size="small"
            >
              Add Field
            </Button>
            
            <Menu
              anchorEl={addFieldAnchor}
              open={Boolean(addFieldAnchor)}
              onClose={() => setAddFieldAnchor(null)}
            >
              <MenuItem onClick={() => handleAddField('env')} disabled={showEnv}>
                Environment {showEnv && '✓'}
              </MenuItem>
              <MenuItem onClick={() => handleAddField('disabled')} disabled={showDisabled}>
                Disabled {showDisabled && '✓'}
              </MenuItem>
              <MenuItem onClick={() => handleAddField('autoApprove')} disabled={showAutoApprove}>
                Auto-approve {showAutoApprove && '✓'}
              </MenuItem>
              <MenuItem onClick={() => handleAddField('disabledTools')} disabled={showDisabledTools}>
                Disabled Tools {showDisabledTools && '✓'}
              </MenuItem>
              <Divider />
              <MenuItem onClick={() => handleAddField('custom')}>
                Custom Field...
              </MenuItem>
            </Menu>
            
            {showEnv && (
              <>
                <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>Environment</Typography>
                {env.map((envVar, idx) => (
                  <Box key={idx} sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                    <TextField
                      size="small"
                      label="Key"
                      value={envVar.key}
                      onChange={(e) => {
                        const newEnv = [...env];
                        newEnv[idx].key = e.target.value;
                        setEnv(newEnv);
                      }}
                      sx={{ flex: 1 }}
                    />
                    <TextField
                      size="small"
                      label="Value"
                      value={envVar.value}
                      onChange={(e) => {
                        const newEnv = [...env];
                        newEnv[idx].value = e.target.value;
                        setEnv(newEnv);
                      }}
                      sx={{ flex: 2 }}
                    />
                    <IconButton size="small" onClick={() => setEnv(env.filter((_, i) => i !== idx))}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
                <Button
                  startIcon={<AddIcon />}
                  onClick={() => setEnv([...env, { key: '', value: '' }])}
                  sx={{ mt: 0.5 }}
                  size="small"
                >
                  Add Variable
                </Button>
              </>
            )}
            
            {showDisabled && (
              <FormControlLabel
                control={<Checkbox checked={disabled} onChange={(e) => setDisabled(e.target.checked)} size="small" />}
                label="Disabled"
                sx={{ mt: 1 }}
              />
            )}
            
            {showAutoApprove && (
              <TextField
                fullWidth
                label="Auto-Approve Tools"
                value={autoApprove}
                onChange={(e) => setAutoApprove(e.target.value)}
                margin="dense"
                size="small"
                helperText="Comma-separated"
              />
            )}
            
            {showDisabledTools && (
              <TextField
                fullWidth
                label="Disabled Tools"
                value={disabledTools}
                onChange={(e) => setDisabledTools(e.target.value)}
                margin="dense"
                size="small"
                helperText="Comma-separated"
              />
            )}
            
            {customFields.length > 0 && (
              <>
                <Divider sx={{ my: 1 }} />
                <Typography variant="caption">Custom Fields</Typography>
                {customFields.map((field, idx) => (
                  <Box key={idx} sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                    <TextField
                      size="small"
                      label="Key"
                      value={field.key}
                      onChange={(e) => {
                        const newFields = [...customFields];
                        newFields[idx].key = e.target.value;
                        setCustomFields(newFields);
                      }}
                      sx={{ flex: 1 }}
                    />
                    <TextField
                      size="small"
                      label="Value"
                      value={field.value}
                      onChange={(e) => {
                        const newFields = [...customFields];
                        newFields[idx].value = e.target.value;
                        setCustomFields(newFields);
                      }}
                      sx={{ flex: 2 }}
                    />
                    <IconButton size="small" onClick={() => setCustomFields(customFields.filter((_, i) => i !== idx))}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
              </>
            )}
          </Box>
          
          {/* Resizable Divider */}
          <ResizableDivider onMouseDown={handleMouseDown} isDragging={isDragging} />
          
          {/* Right: JSON Editor */}
          <Box sx={{ width: `${100 - leftPanelWidth}%`, overflow: 'hidden', display: 'flex', flexDirection: 'column', pl: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Chip 
                label={newServerValid === null ? 'No Input' : newServerValid ? 'Valid JSON' : 'Invalid JSON'} 
                color={newServerValid === null ? 'default' : newServerValid ? 'success' : 'error'} 
                size="small" 
              />
              <Button
                variant="outlined"
                startIcon={<Terminal />}
                onClick={onConvertToWSL}
                disabled={!newServerValid}
                size="small"
              >
                Convert to WSL
              </Button>
            </Box>
            
            <Box sx={{ flex: 1, overflow: 'hidden', border: 1, borderColor: 'divider', borderRadius: 1 }}>
              <JSONEditor
                mode="editable"
                value={newServerJson}
                onChange={onJsonChange}
                height="100%"
              />
            </Box>
            
            {newServerError && (
              <Typography color="error" variant="caption" sx={{ mt: 1 }}>
                {newServerError}
              </Typography>
            )}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={newServerValid !== true}>
          {isEditing ? 'Update Server' : 'Add Server'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddServerDialog;
