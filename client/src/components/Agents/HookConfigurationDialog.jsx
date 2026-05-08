/**
 * @fileoverview Dialog for creating and editing agent hook configurations.
 */
import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  IconButton,
  Divider,
  Paper,
  FormControlLabel,
  RadioGroup,
  Radio
} from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import { getHookTypes, getCommonHookProperties, isToolRelatedHook, getHookTypeLabel } from './hookUtils';
import JSONEditor from '../common/JSONEditor';
import ResizableDivider from '../common/ResizableDivider';
import useResizablePanels from '../../hooks/useResizablePanels';

const HookConfigurationDialog = ({ open, onClose, agent, onAgentChange }) => {
  const [localAgent, setLocalAgent] = useState(agent);
  const { leftPanelWidth, isDragging, handleMouseDown } = useResizablePanels(50, 'hooksDialogPanelWidth', 30, 70);
  
  // Level 1: Hook Type Management
  const [hookTypeMode, setHookTypeMode] = useState('common');
  const [selectedCommonHookType, setSelectedCommonHookType] = useState('');
  const [customHookType, setCustomHookType] = useState('');
  const [selectedHookTypeForEdit, setSelectedHookTypeForEdit] = useState('');
  
  // Level 2: Hook Object Configuration
  const [propertyMode, setPropertyMode] = useState('common');
  const [selectedCommonProperty, setSelectedCommonProperty] = useState('');
  const [customProperty, setCustomProperty] = useState('');
  const [propertyValue, setPropertyValue] = useState('');
  const [editingHookIndex, setEditingHookIndex] = useState(-1);

  useEffect(() => {
    setLocalAgent(agent);
  }, [agent]);

  const updateLocalAgent = (field, value) => {
    setLocalAgent(prev => ({ ...prev, [field]: value }));
  };

  // Get available tools for matcher dropdown
  const getAvailableTools = () => {
    const tools = [];
    
    // Add wildcards
    tools.push({ value: '*', label: 'All tools (*)' });
    tools.push({ value: '@builtin', label: 'All built-in (@builtin)' });
    
    // Add built-in tools from agent's tools array
    const builtInTools = [
      'read', 'write', 'glob', 'grep', 'shell', 'aws',
      'web_search', 'web_fetch', 'introspect', 'report_issue',
      'knowledge', 'thinking', 'todo', 'use_subagent'
    ];
    
    const agentTools = localAgent.tools || [];
    const hasAllTools = agentTools.includes('*');
    
    builtInTools.forEach(tool => {
      if (hasAllTools || agentTools.includes(tool) || agentTools.includes('@builtin')) {
        tools.push({ value: tool, label: tool });
      }
    });
    
    // Add MCP server wildcards and specific tools
    Object.keys(localAgent.mcpServers || {}).forEach(serverName => {
      const serverWildcard = `@${serverName}`;
      if (hasAllTools || agentTools.includes(serverWildcard)) {
        tools.push({ value: serverWildcard, label: `All @${serverName} tools` });
      }
      
      // Add specific MCP tools if they're enabled
      agentTools.forEach(tool => {
        if (tool.startsWith(`@${serverName}/`)) {
          tools.push({ value: tool, label: tool });
        }
      });
    });
    
    return tools;
  };

  // Add hook type
  const addHookType = () => {
    const hookType = hookTypeMode === 'common' ? selectedCommonHookType : customHookType.trim();
    if (!hookType) return;
    
    const currentHooks = localAgent.hooks || {};
    if (!currentHooks[hookType]) {
      updateLocalAgent('hooks', { ...currentHooks, [hookType]: [] });
    }
    
    // Select the hook type for editing
    setSelectedHookTypeForEdit(hookType);
    
    // Reset form
    setSelectedCommonHookType('');
    setCustomHookType('');
  };

  // Add hook object to selected hook type
  const addHookObject = () => {
    if (!selectedHookTypeForEdit) return;
    
    const currentHooks = localAgent.hooks || {};
    const currentHookArray = currentHooks[selectedHookTypeForEdit] || [];
    
    const newHook = { command: '' }; // Start with empty command
    const updatedHooks = {
      ...currentHooks,
      [selectedHookTypeForEdit]: [...currentHookArray, newHook]
    };
    
    updateLocalAgent('hooks', updatedHooks);
    
    // Select the new hook for editing
    setEditingHookIndex(currentHookArray.length);
  };

  // Remove hook object
  const removeHookObject = (hookType, hookIndex) => {
    const currentHooks = localAgent.hooks || {};
    const currentHookArray = currentHooks[hookType] || [];
    
    const updatedHookArray = currentHookArray.filter((_, index) => index !== hookIndex);
    
    if (updatedHookArray.length === 0) {
      const { [hookType]: removed, ...remainingHooks } = currentHooks;
      updateLocalAgent('hooks', remainingHooks);
      if (selectedHookTypeForEdit === hookType) {
        setSelectedHookTypeForEdit('');
        setEditingHookIndex(-1);
      }
    } else {
      const updatedHooks = {
        ...currentHooks,
        [hookType]: updatedHookArray
      };
      updateLocalAgent('hooks', updatedHooks);
      
      // Adjust editing index if needed
      if (editingHookIndex >= hookIndex && editingHookIndex > 0) {
        setEditingHookIndex(editingHookIndex - 1);
      }
    }
  };

  // Remove entire hook type
  const removeHookType = (hookType) => {
    const currentHooks = localAgent.hooks || {};
    const { [hookType]: removed, ...remainingHooks } = currentHooks;
    updateLocalAgent('hooks', remainingHooks);
    
    if (selectedHookTypeForEdit === hookType) {
      setSelectedHookTypeForEdit('');
      setEditingHookIndex(-1);
    }
  };

  // Add property to current hook object
  const addPropertyToHook = () => {
    if (!selectedHookTypeForEdit || editingHookIndex === -1 || !propertyValue.trim()) return;
    
    const property = propertyMode === 'common' ? selectedCommonProperty : customProperty.trim();
    if (!property) return;
    
    const currentHooks = localAgent.hooks || {};
    const currentHookArray = currentHooks[selectedHookTypeForEdit] || [];
    
    if (editingHookIndex >= currentHookArray.length) return;
    
    const updatedHookArray = currentHookArray.map((hook, index) => {
      if (index === editingHookIndex) {
        let value = propertyValue.trim();
        
        // Try to parse numbers for numeric properties
        if (['timeout_ms', 'cache_ttl_seconds', 'max_output_size'].includes(property)) {
          const numValue = parseInt(value);
          if (!isNaN(numValue)) {
            value = numValue;
          }
        }
        
        return { ...hook, [property]: value };
      }
      return hook;
    });
    
    const updatedHooks = {
      ...currentHooks,
      [selectedHookTypeForEdit]: updatedHookArray
    };
    
    updateLocalAgent('hooks', updatedHooks);
    
    // Reset property form
    setSelectedCommonProperty('');
    setCustomProperty('');
    setPropertyValue('');
  };

  // Remove property from hook object
  const removePropertyFromHook = (property) => {
    if (!selectedHookTypeForEdit || editingHookIndex === -1) return;
    
    const currentHooks = localAgent.hooks || {};
    const currentHookArray = currentHooks[selectedHookTypeForEdit] || [];
    
    if (editingHookIndex >= currentHookArray.length) return;
    
    const updatedHookArray = currentHookArray.map((hook, index) => {
      if (index === editingHookIndex) {
        const { [property]: removed, ...remainingProps } = hook;
        return remainingProps;
      }
      return hook;
    });
    
    const updatedHooks = {
      ...currentHooks,
      [selectedHookTypeForEdit]: updatedHookArray
    };
    
    updateLocalAgent('hooks', updatedHooks);
  };

  const handleApply = () => {
    onAgentChange(localAgent);
    onClose();
  };

  const handleCancel = () => {
    setLocalAgent(agent);
    onClose();
  };

  const hooks = localAgent.hooks || {};
  const selectedHookArray = selectedHookTypeForEdit ? (hooks[selectedHookTypeForEdit] || []) : [];
  const currentHook = editingHookIndex >= 0 && editingHookIndex < selectedHookArray.length ? 
    selectedHookArray[editingHookIndex] : null;

  return (
    <Dialog 
      open={open} 
      onClose={handleCancel}
      maxWidth="xl"
      fullWidth
      PaperProps={{ sx: { height: '90vh' } }}
    >
      <DialogTitle>Hook Configuration</DialogTitle>
      
      <DialogContent sx={{ p: 0 }}>
        <Box sx={{ display: 'flex', height: '100%' }} data-resizable-container>
          
          {/* Left Side - Hook Management Interface */}
          <Box sx={{ width: `${leftPanelWidth}%`, p: 3, borderRight: 1, borderColor: 'divider', overflow: 'auto', minWidth: 0 }}>
            
            {/* Level 1: Hook Types Section */}
            <Box sx={{ mb: 4 }}>
              <Typography variant="h6" gutterBottom>Hook Types</Typography>
              
              {/* Add Hook Type */}
              <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 1, mb: 2 }}>
                <Typography variant="subtitle2" gutterBottom>Add Hook Type</Typography>
                
                <FormControl component="fieldset" sx={{ mb: 2 }}>
                  <RadioGroup
                    row
                    value={hookTypeMode}
                    onChange={(e) => setHookTypeMode(e.target.value)}
                  >
                    <FormControlLabel value="common" control={<Radio />} label="Common" />
                    <FormControlLabel value="custom" control={<Radio />} label="Custom" />
                  </RadioGroup>
                </FormControl>
                
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
                  {hookTypeMode === 'common' ? (
                    <FormControl size="small" sx={{ minWidth: 200 }}>
                      <InputLabel>Hook Type</InputLabel>
                      <Select
                        value={selectedCommonHookType}
                        label="Hook Type"
                        onChange={(e) => setSelectedCommonHookType(e.target.value)}
                      >
                        {getHookTypes().map((type) => (
                          <MenuItem 
                            key={type.value} 
                            value={type.value}
                            disabled={hooks[type.value] !== undefined}
                          >
                            <Box>
                              <Typography variant="body2">{type.label}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {type.description}
                              </Typography>
                            </Box>
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  ) : (
                    <TextField
                      size="small"
                      placeholder="Custom hook type"
                      value={customHookType}
                      onChange={(e) => setCustomHookType(e.target.value)}
                      sx={{ width: 200 }}
                    />
                  )}
                  
                  <Button
                    size="small"
                    onClick={addHookType}
                    disabled={hookTypeMode === 'common' ? !selectedCommonHookType : !customHookType.trim()}
                  >
                    Add
                  </Button>
                </Box>
              </Box>
              
              {/* Existing Hook Types */}
              <Box>
                <Typography variant="subtitle2" gutterBottom>Existing Hook Types</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {Object.entries(hooks).map(([hookType, hookArray]) => (
                    <Box 
                      key={hookType} 
                      sx={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 1, 
                        p: 1, 
                        border: 1, 
                        borderColor: selectedHookTypeForEdit === hookType ? 'primary.main' : 'divider',
                        borderRadius: 1,
                        cursor: 'pointer',
                        '&:hover': { borderColor: 'primary.light' }
                      }}
                      onClick={() => {
                        setSelectedHookTypeForEdit(hookType);
                        setEditingHookIndex(-1);
                      }}
                    >
                      <Typography variant="body2" sx={{ flex: 1 }}>
                        {getHookTypeLabel(hookType)} ({hookArray.length} hooks)
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeHookType(hookType);
                        }}
                        color="error"
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </Box>
                  ))}
                  
                  {Object.keys(hooks).length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      No hook types configured
                    </Typography>
                  )}
                </Box>
              </Box>
            </Box>

            <Divider sx={{ my: 3 }} />

            {/* Level 2: Hook Objects Section */}
            {selectedHookTypeForEdit && (
              <Box sx={{ mb: 4 }}>
                <Typography variant="h6" gutterBottom>
                  {getHookTypeLabel(selectedHookTypeForEdit)} Hooks
                </Typography>
                
                {/* Hook Objects List */}
                <Box sx={{ mb: 2 }}>
                  {selectedHookArray.map((hook, index) => (
                    <Box 
                      key={index}
                      sx={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 1, 
                        p: 1, 
                        border: 1, 
                        borderColor: editingHookIndex === index ? 'primary.main' : 'divider',
                        borderRadius: 1,
                        mb: 1,
                        cursor: 'pointer',
                        '&:hover': { borderColor: 'primary.light' }
                      }}
                      onClick={() => setEditingHookIndex(index)}
                    >
                      <Typography variant="body2" sx={{ flex: 1 }}>
                        Hook #{index + 1}: {hook.command || '(no command)'}
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeHookObject(selectedHookTypeForEdit, index);
                        }}
                        color="error"
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </Box>
                  ))}
                  
                  {selectedHookArray.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      No hooks configured for this type
                    </Typography>
                  )}
                </Box>
                
                <Button
                  variant="outlined"
                  startIcon={<Add />}
                  onClick={addHookObject}
                  size="small"
                >
                  Add Hook Object
                </Button>
              </Box>
            )}

            {/* Hook Properties Section */}
            {currentHook && (
              <Box>
                <Typography variant="h6" gutterBottom>
                  Hook Properties (Hook #{editingHookIndex + 1})
                </Typography>
                
                {/* Current Properties */}
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>Current Properties:</Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {Object.entries(currentHook).map(([key, value]) => (
                      <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip 
                          label={`${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`} 
                          variant="outlined" 
                          size="small" 
                        />
                        <IconButton
                          size="small"
                          onClick={() => removePropertyFromHook(key)}
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </Box>
                    ))}
                    
                    {Object.keys(currentHook).length === 0 && (
                      <Typography variant="body2" color="text.secondary">
                        No properties configured
                      </Typography>
                    )}
                  </Box>
                </Box>
                
                {/* Add Property */}
                <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                  <Typography variant="subtitle2" gutterBottom>Add Property</Typography>
                  
                  <FormControl component="fieldset" sx={{ mb: 2 }}>
                    <RadioGroup
                      row
                      value={propertyMode}
                      onChange={(e) => setPropertyMode(e.target.value)}
                    >
                      <FormControlLabel value="common" control={<Radio />} label="Common" />
                      <FormControlLabel value="custom" control={<Radio />} label="Custom" />
                    </RadioGroup>
                  </FormControl>
                  
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {propertyMode === 'common' ? (
                      <FormControl size="small" sx={{ minWidth: 200 }}>
                        <InputLabel>Property</InputLabel>
                        <Select
                          value={selectedCommonProperty}
                          label="Property"
                          onChange={(e) => setSelectedCommonProperty(e.target.value)}
                        >
                          {getCommonHookProperties().map((prop) => (
                            <MenuItem key={prop} value={prop}>
                              {prop}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    ) : (
                      <TextField
                        size="small"
                        placeholder="Custom property name"
                        value={customProperty}
                        onChange={(e) => setCustomProperty(e.target.value)}
                        sx={{ width: 200 }}
                      />
                    )}
                    
                    {/* Value Input */}
                    {(propertyMode === 'common' && selectedCommonProperty === 'matcher') ? (
                      <FormControl size="small" sx={{ minWidth: 250 }}>
                        <InputLabel>Tool Matcher</InputLabel>
                        <Select
                          value={propertyValue}
                          label="Tool Matcher"
                          onChange={(e) => setPropertyValue(e.target.value)}
                          disabled={!isToolRelatedHook(selectedHookTypeForEdit)}
                        >
                          {getAvailableTools().map((tool) => (
                            <MenuItem key={tool.value} value={tool.value}>
                              {tool.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    ) : (
                      <TextField
                        size="small"
                        placeholder="Property value"
                        value={propertyValue}
                        onChange={(e) => setPropertyValue(e.target.value)}
                        sx={{ width: 250 }}
                      />
                    )}
                    
                    <Button
                      variant="contained"
                      size="small"
                      onClick={addPropertyToHook}
                      disabled={
                        (propertyMode === 'common' ? !selectedCommonProperty : !customProperty.trim()) ||
                        !propertyValue.trim()
                      }
                      sx={{ alignSelf: 'flex-start' }}
                    >
                      Add Property
                    </Button>
                  </Box>
                </Box>
              </Box>
            )}
            
          </Box>

          {/* Resizer */}
          <ResizableDivider onMouseDown={handleMouseDown} isDragging={isDragging} />

          {/* Right Side - Live JSON Preview */}
          <Box sx={{ flex: 1, p: 2, overflow: 'hidden', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h6" gutterBottom sx={{ mb: 1 }}>Live JSON Preview</Typography>
            
            <Box sx={{ flex: 1, minHeight: 0 }}>
              <JSONEditor 
                mode="readonly"
                value={JSON.stringify({
                  ...(Object.keys(hooks).length > 0 && { hooks })
                }, null, 2)}
                height="100%"
              />
            </Box>
          </Box>
          
        </Box>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={handleCancel}>Cancel</Button>
        <Button onClick={handleApply} variant="contained">Apply</Button>
      </DialogActions>
    </Dialog>
  );
};

export default HookConfigurationDialog;
