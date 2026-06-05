/**
 * @fileoverview Dialog for configuring individual tool settings and permissions.
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
  Switch,
  FormControlLabel,
  Checkbox,
  FormGroup,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  IconButton,
  Divider,
  Paper,
  CircularProgress,
  Alert
} from '@mui/material';
import { Add, Delete, FolderOpen } from '@mui/icons-material';
import { mcpService, agentService } from '../../services/api';
import UniversalPathBrowser from '../common/UniversalPathBrowser';
import JSONEditor from '../common/JSONEditor';
import ResizableDivider from '../common/ResizableDivider';
import useResizablePanels from '../../hooks/useResizablePanels';

const ToolConfigurationDialog = ({ open, onClose, agent, onAgentChange }) => {
  const [localAgent, setLocalAgent] = useState(agent);
  const { leftPanelWidth, isDragging, handleMouseDown } = useResizablePanels(50, 'toolsDialogPanelWidth', 30, 70);
  const [mcpTools, setMcpTools] = useState({});
  const [loadingTools, setLoadingTools] = useState(false);
  const [selectedAliasFrom, setSelectedAliasFrom] = useState('');
  const [aliasToValue, setAliasToValue] = useState('');
  
  // Tool Settings form state
  const [selectedToolForSettings, setSelectedToolForSettings] = useState('');
  const [settingNameMode, setSettingNameMode] = useState('common');
  const [commonSettingName, setCommonSettingName] = useState('');
  const [customSettingName, setCustomSettingName] = useState('');
  const [valueType, setValueType] = useState('array');
  const [settingValues, setSettingValues] = useState(['']);
  const [singleValue, setSingleValue] = useState('');
  const [keyValuePairs, setKeyValuePairs] = useState([{ key: '', value: '' }]);
  const [expandedTool, setExpandedTool] = useState(''); // Track which tool's properties are shown
  
  // AllowedTools pattern input
  const [allowedToolPattern, setAllowedToolPattern] = useState('');

  // Subagent config state
  const [knownAgents, setKnownAgents] = useState([]);
  const [availableGlobPattern, setAvailableGlobPattern] = useState('');
  const [trustedGlobPattern, setTrustedGlobPattern] = useState('');

  useEffect(() => {
    setLocalAgent(agent);
  }, [agent]);

  // Load known agent names for subagent config
  useEffect(() => {
    if (!open) return;
    agentService.getAllAgentNames().then(names => {
      setKnownAgents(Array.isArray(names) ? names : []);
    }).catch(() => setKnownAgents([]));
  }, [open]);

  // Clean up orphaned MCP tool references when mcpServers changes
  useEffect(() => {
    const serverNames = Object.keys(localAgent.mcpServers || {});
    const validServerPrefixes = serverNames.map(name => `@${name}`);
    
    // Clean tools array
    const cleanedTools = (localAgent.tools || []).filter(tool => {
      if (typeof tool !== 'string') return true;
      if (tool === '*' || !tool.startsWith('@')) return true;
      return validServerPrefixes.some(prefix => tool === prefix || tool.startsWith(`${prefix}/`));
    });
    
    // Clean allowedTools array
    const cleanedAllowedTools = (localAgent.allowedTools || []).filter(tool => {
      if (typeof tool !== 'string') return true;
      if (!tool.startsWith('@')) return true;
      return validServerPrefixes.some(prefix => tool === prefix || tool.startsWith(`${prefix}/`));
    });
    
    // Clean toolAliases object
    const cleanedAliases = {};
    Object.entries(localAgent.toolAliases || {}).forEach(([key, value]) => {
      if (!key.startsWith('@')) {
        cleanedAliases[key] = value;
      } else {
        const isValid = validServerPrefixes.some(prefix => key === prefix || key.startsWith(`${prefix}/`));
        if (isValid) cleanedAliases[key] = value;
      }
    });
    
    // Clean toolsSettings object
    const cleanedSettings = {};
    Object.entries(localAgent.toolsSettings || {}).forEach(([key, value]) => {
      if (!key.startsWith('@')) {
        cleanedSettings[key] = value;
      } else {
        const isValid = validServerPrefixes.some(prefix => key === prefix || key.startsWith(`${prefix}/`));
        if (isValid) cleanedSettings[key] = value;
      }
    });
    
    // Update if anything changed
    const hasChanges = 
      JSON.stringify(cleanedTools) !== JSON.stringify(localAgent.tools) ||
      JSON.stringify(cleanedAllowedTools) !== JSON.stringify(localAgent.allowedTools) ||
      JSON.stringify(cleanedAliases) !== JSON.stringify(localAgent.toolAliases) ||
      JSON.stringify(cleanedSettings) !== JSON.stringify(localAgent.toolsSettings);
    
    if (hasChanges) {
      setLocalAgent(prev => ({
        ...prev,
        tools: cleanedTools,
        allowedTools: cleanedAllowedTools,
        toolAliases: cleanedAliases,
        toolsSettings: cleanedSettings
      }));
    }
  }, [localAgent.mcpServers]);

  useEffect(() => {
    if (open && Object.keys(localAgent.mcpServers || {}).length > 0) {
      loadMcpTools();
    }
  }, [open, JSON.stringify(localAgent.mcpServers)]); // Stringify to prevent object reference changes

  const loadMcpTools = async () => {
    setLoadingTools(true);
    try {
      const servers = localAgent.mcpServers;
      const results = {};
      await Promise.allSettled(
        Object.entries(servers).map(async ([name, cfg]) => {
          if (cfg.disabled) return;
          try {
            const response = await mcpService.getAgentTools({ [name]: cfg });
            if (response.data?.[name]) results[name] = response.data[name];
          } catch (err) {
            console.error(`Failed to load tools for ${name}:`, err);
            results[name] = [];
          }
        })
      );
      setMcpTools(results);
    } catch (error) {
      console.error('Failed to load MCP tools:', error);
      setMcpTools({});
    } finally {
      setLoadingTools(false);
    }
  };

  const builtInTools = [
    'read', 'write', 'glob', 'grep', 'shell', 'aws',
    'web_search', 'web_fetch', 'introspect', 'report_issue',
    'knowledge', 'thinking', 'todo', 'subagent'
  ];

  const tools = localAgent.tools || [];
  const hasAllTools = tools.includes('*');

  const updateLocalAgent = (field, value) => {
    setLocalAgent(prev => ({ ...prev, [field]: value }));
  };

  const handleAllToolsToggle = (enabled) => {
    if (enabled) {
      updateLocalAgent('tools', ['*']);
    } else {
      updateLocalAgent('tools', []);
    }
  };

  const handleIndividualTool = (tool, enabled) => {
    const currentTools = tools.filter(t => t !== '*');
    if (enabled) {
      updateLocalAgent('tools', [...currentTools, tool]);
    } else {
      updateLocalAgent('tools', currentTools.filter(t => t !== tool));
    }
  };

  const handleMcpServerToggle = (serverName, enabled) => {
    const serverWildcard = `@${serverName}`;
    const currentTools = tools.filter(t => t !== '*');
    
    if (enabled) {
      // Remove individual server tools and add server wildcard
      const filteredTools = currentTools.filter(t => !t.startsWith(`@${serverName}/`));
      updateLocalAgent('tools', [...filteredTools, serverWildcard]);
    } else {
      // Remove server wildcard
      updateLocalAgent('tools', currentTools.filter(t => t !== serverWildcard));
    }
  };

  const handleMcpToolToggle = (serverName, toolName, enabled) => {
    const serverWildcard = `@${serverName}`;
    const specificTool = `@${serverName}/${toolName}`;
    const serverTools = mcpTools[serverName] || [];
    let currentTools = tools.filter(t => t !== '*');
    
    if (enabled) {
      // If server wildcard exists, convert to individual tools
      if (currentTools.includes(serverWildcard)) {
        currentTools = currentTools.filter(t => t !== serverWildcard);
        // Add all server tools by name
        const allServerToolNames = serverTools.map(toolObj => 
          typeof toolObj === 'string' ? toolObj : toolObj.name
        ).map(name => `@${serverName}/${name}`);
        currentTools = [...currentTools, ...allServerToolNames];
      } else {
        // Just add this specific tool
        currentTools = [...currentTools, specificTool];
      }
    } else {
      // If server wildcard exists, convert to individual tools minus this one
      if (currentTools.includes(serverWildcard)) {
        currentTools = currentTools.filter(t => t !== serverWildcard);
        // Add all server tools except the one being toggled off
        const allServerToolNames = serverTools
          .map(toolObj => typeof toolObj === 'string' ? toolObj : toolObj.name)
          .filter(name => name !== toolName)
          .map(name => `@${serverName}/${name}`);
        currentTools = [...currentTools, ...allServerToolNames];
      } else {
        // Just remove this specific tool
        currentTools = currentTools.filter(t => t !== specificTool);
      }
    }
    
    updateLocalAgent('tools', currentTools);
  };

  const isToolEnabled = (tool) => {
    return hasAllTools || tools.includes(tool);
  };

  const isMcpServerEnabled = (serverName) => {
    return hasAllTools || tools.includes(`@${serverName}`);
  };

  const isMcpToolEnabled = (serverName, toolName) => {
    if (hasAllTools || tools.includes(`@${serverName}`)) return true;
    return tools.includes(`@${serverName}/${toolName}`);
  };

  const handleApply = () => {
    onAgentChange(localAgent);
    onClose();
  };

  const handleCancel = () => {
    setLocalAgent(agent);
    onClose();
  };

  const handleToolSettingsFileSelect = (fileUri) => {
    // Add the selected file path to the setting values
    // Filter out null/undefined values before adding
    setSettingValues(prev => [...prev.filter(v => v && v.trim()), fileUri]);
  };

  const getCommonSettings = (toolName) => {
    // All possible common settings from Kiro docs
    const allCommonSettings = [
      'allowedPaths',
      'deniedPaths', 
      'allowedCommands',
      'deniedCommands',
      'allowedServices',
      'deniedServices',
      'autoAllowReadonly'
    ];
    
    // For MCP tools, no common settings
    if (toolName.startsWith('@')) {
      return [];
    }
    
    // Return all common settings for any built-in tool
    return allCommonSettings;
  };

  // Helper to check if a setting uses glob patterns
  const isPathBasedSetting = (settingName) => {
    return ['allowedPaths', 'deniedPaths'].includes(settingName);
  };

  // Populate form with existing tool setting for editing
  const populateFormWithSetting = (toolName, propertyName, propertyValue) => {
    // Set the tool
    setSelectedToolForSettings(toolName);
    
    // Set the property name
    const isCommonSetting = getCommonSettings(toolName).includes(propertyName);
    if (isCommonSetting) {
      setSettingNameMode('common');
      setCommonSettingName(propertyName);
      setCustomSettingName('');
    } else {
      setSettingNameMode('custom');
      setCustomSettingName(propertyName);
      setCommonSettingName('');
    }
    
    // Set the value type and values based on the property value
    if (Array.isArray(propertyValue)) {
      setValueType('array');
      setSettingValues(propertyValue.map(v => String(v)));
      setSingleValue('');
      setKeyValuePairs([{ key: '', value: '' }]);
    } else if (typeof propertyValue === 'object' && propertyValue !== null) {
      setValueType('keyvalue');
      setKeyValuePairs(Object.entries(propertyValue).map(([k, v]) => ({ key: k, value: String(v) })));
      setSettingValues(['']);
      setSingleValue('');
    } else {
      setValueType('single');
      setSingleValue(String(propertyValue));
      setSettingValues(['']);
      setKeyValuePairs([{ key: '', value: '' }]);
    }
  };

  // Remove individual property from tool
  const removePropertyFromTool = (toolName, propertyName) => {
    const currentSettings = localAgent.toolsSettings || {};
    const toolSettings = currentSettings[toolName] || {};
    
    const { [propertyName]: removed, ...remainingProps } = toolSettings;
    
    if (Object.keys(remainingProps).length === 0) {
      // Remove entire tool if no properties left
      const { [toolName]: removedTool, ...remainingTools } = currentSettings;
      updateLocalAgent('toolsSettings', remainingTools);
    } else {
      // Update tool with remaining properties
      const newSettings = { ...currentSettings, [toolName]: remainingProps };
      updateLocalAgent('toolsSettings', newSettings);
    }
  };

  // Subagent helpers
  const getSubagentSetting = (key) => (localAgent.toolsSettings?.subagent?.[key] || []);

  const updateSubagentSetting = (key, value) => {
    const currentSettings = localAgent.toolsSettings || {};
    const subagent = currentSettings.subagent || {};
    const updated = { ...subagent, [key]: value };
    if (value.length === 0) delete updated[key];
    const newSettings = { ...currentSettings, subagent: updated };
    if (Object.keys(updated).length === 0) delete newSettings.subagent;
    updateLocalAgent('toolsSettings', newSettings);
  };

  const addToSubagentList = (key, item) => {
    const current = getSubagentSetting(key);
    if (!current.includes(item)) updateSubagentSetting(key, [...current, item]);
  };

  const removeFromSubagentList = (key, item) => {
    updateSubagentSetting(key, getSubagentSetting(key).filter(i => i !== item));
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleCancel}
      maxWidth="xl"
      fullWidth
      PaperProps={{ sx: { height: '90vh' } }}
    >
      <DialogTitle>Tool Configuration</DialogTitle>
      
      <DialogContent sx={{ p: 0 }}>
        <Box sx={{ display: 'flex', height: '100%' }} data-resizable-container>
          
          {/* Left Side - Tool Management Interface */}
          <Box sx={{ width: `${leftPanelWidth}%`, p: 3, borderRight: 1, borderColor: 'divider', overflow: 'auto', minWidth: 0 }}>
            
            {/* Available Tools Section */}
            <Box sx={{ mb: 4 }}>
              <Typography variant="h6" gutterBottom>Available Tools</Typography>
              
              {/* All Tools (*) */}
              <FormControlLabel
                control={
                  <Checkbox
                    checked={hasAllTools}
                    onChange={(e) => handleAllToolsToggle(e.target.checked)}
                  />
                }
                label="All Tools (*)"
                sx={{ mb: 1, fontWeight: 'bold' }}
              />
              
              {/* All Built-in (@builtin) */}
              <Box sx={{ ml: 4, mb: 2 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={tools.includes('@builtin')}
                      disabled={hasAllTools}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const newTools = tools.filter(t => t !== '*' && !builtInTools.includes(t));
                          updateLocalAgent('tools', [...newTools, '@builtin']);
                        } else {
                          updateLocalAgent('tools', tools.filter(t => t !== '@builtin'));
                        }
                      }}
                    />
                  }
                  label="All Built-in (@builtin)"
                  sx={{ fontWeight: 'medium' }}
                />
                
                {/* Individual Built-in Tools */}
                <Box sx={{ ml: 4 }}>
                  <FormGroup>
                    {builtInTools.map(tool => (
                      <FormControlLabel
                        key={tool}
                        control={
                          <Checkbox
                            checked={isToolEnabled(tool)}
                            disabled={hasAllTools || tools.includes('@builtin')}
                            onChange={(e) => handleIndividualTool(tool, e.target.checked)}
                            size="small"
                          />
                        }
                        label={tool}
                        sx={{ fontSize: '0.875rem' }}
                      />
                    ))}
                  </FormGroup>
                </Box>
              </Box>
              
              {/* MCP Servers */}
              <Box sx={{ ml: 4 }}>
                <Typography variant="subtitle2" gutterBottom>MCP Servers:</Typography>
                
                {loadingTools && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <CircularProgress size={16} />
                    <Typography variant="body2" color="text.secondary">
                      Loading MCP tools...
                    </Typography>
                  </Box>
                )}
                
                {Object.keys(localAgent.mcpServers || {}).map(serverName => (
                  <Box key={serverName} sx={{ mb: 2 }}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={isMcpServerEnabled(serverName)}
                          disabled={hasAllTools}
                          onChange={(e) => handleMcpServerToggle(serverName, e.target.checked)}
                        />
                      }
                      label={`All @${serverName} tools`}
                      sx={{ fontWeight: 'medium' }}
                    />
                    
                    {/* Individual MCP Tools */}
                    <Box sx={{ ml: 4 }}>
                      {(mcpTools[serverName] || []).map((toolObj, index) => {
                        const toolName = typeof toolObj === 'string' ? toolObj : toolObj.name;
                        return (
                          <FormControlLabel
                            key={toolName || index}
                            control={
                              <Checkbox
                                checked={isMcpToolEnabled(serverName, toolName)}
                                disabled={hasAllTools}
                                onChange={(e) => handleMcpToolToggle(serverName, toolName, e.target.checked)}
                                size="small"
                              />
                            }
                            label={toolName}
                            sx={{ fontSize: '0.875rem', display: 'block' }}
                          />
                        );
                      })}
                      
                      {!loadingTools && (mcpTools[serverName] || []).length === 0 && (
                        <Typography variant="body2" color="text.secondary">
                          No tools available or server not responding
                        </Typography>
                      )}
                    </Box>
                  </Box>
                ))}
                
                {Object.keys(localAgent.mcpServers || {}).length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    No MCP servers configured
                  </Typography>
                )}
              </Box>
            </Box>

            <Divider sx={{ my: 3 }} />

            {/* Auto-Allow Tools Section */}
            <Box sx={{ mb: 4 }}>
              <Typography variant="h6" gutterBottom>Auto-Allow Tools</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Tools that can run without permission prompts
              </Typography>
              
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                {(localAgent.allowedTools || []).map((tool, index) => (
                  <Chip
                    key={index}
                    label={tool}
                    onDelete={() => {
                      const newAllowed = (localAgent.allowedTools || []).filter((_, i) => i !== index);
                      updateLocalAgent('allowedTools', newAllowed);
                    }}
                    color="success"
                    size="small"
                  />
                ))}
              </Box>
              
              <FormControl size="small" sx={{ minWidth: 300 }}>
                <InputLabel>Add tool to auto-allow</InputLabel>
                <Select
                  value=""
                  label="Add tool to auto-allow"
                  onChange={(e) => {
                    const selectedTool = e.target.value;
                    if (selectedTool && !(localAgent.allowedTools || []).includes(selectedTool)) {
                      const newAllowed = [...(localAgent.allowedTools || []), selectedTool];
                      updateLocalAgent('allowedTools', newAllowed);
                    }
                  }}
                >
                  {/* Only show tools that are selected in Available Tools */}
                  
                  {/* Built-in tools - only if selected */}
                  {builtInTools
                    .filter(tool => isToolEnabled(tool))
                    .map(tool => (
                      <MenuItem 
                        key={tool} 
                        value={tool}
                        disabled={(localAgent.allowedTools || []).includes(tool)}
                      >
                        {tool}
                      </MenuItem>
                    ))}
                  
                  {/* MCP Server wildcards - only if selected */}
                  {Object.keys(localAgent.mcpServers || {})
                    .filter(serverName => isMcpServerEnabled(serverName))
                    .map(serverName => (
                      <MenuItem 
                        key={`@${serverName}`} 
                        value={`@${serverName}`}
                        disabled={(localAgent.allowedTools || []).includes(`@${serverName}`)}
                      >
                        @{serverName} (all tools)
                      </MenuItem>
                    ))}
                  
                  {/* Individual MCP tools - only if selected */}
                  {Object.entries(mcpTools).map(([serverName, tools]) => 
                    tools
                      .filter(toolObj => {
                        const toolName = typeof toolObj === 'string' ? toolObj : toolObj.name;
                        return isMcpToolEnabled(serverName, toolName);
                      })
                      .map(toolObj => {
                        const toolName = typeof toolObj === 'string' ? toolObj : toolObj.name;
                        const fullToolName = `@${serverName}/${toolName}`;
                        return (
                          <MenuItem 
                            key={fullToolName} 
                            value={fullToolName}
                            disabled={(localAgent.allowedTools || []).includes(fullToolName)}
                          >
                            @{serverName}/{toolName}
                          </MenuItem>
                        );
                      })
                  )}
                </Select>
              </FormControl>
              
              {/* Wildcard Pattern Input */}
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" gutterBottom>
                  Or use wildcard pattern:
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                  <TextField
                    size="small"
                    placeholder="e.g., read_*, @server/api_*, @git-*/status"
                    value={allowedToolPattern}
                    onChange={(e) => setAllowedToolPattern(e.target.value)}
                    sx={{ minWidth: 300 }}
                  />
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      if (allowedToolPattern.trim() && !(localAgent.allowedTools || []).includes(allowedToolPattern.trim())) {
                        const newAllowed = [...(localAgent.allowedTools || []), allowedToolPattern.trim()];
                        updateLocalAgent('allowedTools', newAllowed);
                        setAllowedToolPattern('');
                      }
                    }}
                  >
                    Add Pattern
                  </Button>
                </Box>
                
                {/* Wildcard Pattern Help */}
                <Alert severity="info" sx={{ mt: 2 }}>
                  <Typography variant="body2" gutterBottom sx={{ fontWeight: 'bold' }}>
                    Wildcard Pattern Support
                  </Typography>
                  <Typography variant="caption" component="div" sx={{ mb: 0.5 }}>
                    Use wildcards to match multiple tools:
                  </Typography>
                  <Box component="ul" sx={{ mt: 0.5, mb: 0, pl: 2, '& li': { mb: 0.25 } }}>
                    <Typography variant="caption" component="li">
                      <code>*</code> matches any characters - Example: <code>read_*</code> matches read_file, read_config
                    </Typography>
                    <Typography variant="caption" component="li">
                      <code>?</code> matches single character - Example: <code>?ead</code> matches read, head
                    </Typography>
                    <Typography variant="caption" component="li">
                      <code>@server/api_*</code> - All API tools from a server
                    </Typography>
                    <Typography variant="caption" component="li">
                      <code>@git-*/status</code> - Status tool from any git-* server
                    </Typography>
                  </Box>
                </Alert>
              </Box>
            </Box>

            <Divider sx={{ my: 3 }} />

            {/* Tool Aliases Section */}
            <Box sx={{ mb: 4 }}>
              <Typography variant="h6" gutterBottom>Tool Aliases</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Rename tools to avoid conflicts
              </Typography>
              
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                {Object.entries(localAgent.toolAliases || {}).map(([from, to]) => (
                  <Box key={from} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip label={from} variant="outlined" size="small" />
                    <Typography>→</Typography>
                    <Chip label={to} color="primary" size="small" />
                    <IconButton
                      size="small"
                      onClick={() => {
                        const { [from]: removed, ...rest } = localAgent.toolAliases || {};
                        updateLocalAgent('toolAliases', rest);
                      }}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
              </Box>
              
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
                <FormControl size="small" sx={{ minWidth: 200 }}>
                  <InputLabel>Original tool</InputLabel>
                  <Select
                    value={selectedAliasFrom}
                    label="Original tool"
                    onChange={(e) => setSelectedAliasFrom(e.target.value)}
                  >
                    {/* Built-in tools - only if selected */}
                    {builtInTools
                      .filter(tool => isToolEnabled(tool))
                      .map(tool => (
                        <MenuItem key={tool} value={tool}>
                          {tool}
                        </MenuItem>
                      ))}
                    
                    {/* MCP Server wildcards - only if selected */}
                    {Object.keys(localAgent.mcpServers || {})
                      .filter(serverName => isMcpServerEnabled(serverName))
                      .map(serverName => (
                        <MenuItem key={`@${serverName}`} value={`@${serverName}`}>
                          @{serverName} (all tools)
                        </MenuItem>
                      ))}
                    
                    {/* Individual MCP tools - only if selected */}
                    {Object.entries(mcpTools).map(([serverName, tools]) => 
                      tools
                        .filter(toolObj => {
                          const toolName = typeof toolObj === 'string' ? toolObj : toolObj.name;
                          return isMcpToolEnabled(serverName, toolName);
                        })
                        .map(toolObj => {
                          const toolName = typeof toolObj === 'string' ? toolObj : toolObj.name;
                          const fullToolName = `@${serverName}/${toolName}`;
                          return (
                            <MenuItem key={fullToolName} value={fullToolName}>
                              @{serverName}/{toolName}
                            </MenuItem>
                          );
                        })
                    )}
                  </Select>
                </FormControl>
                
                <TextField
                  size="small"
                  placeholder="Alias name"
                  value={aliasToValue}
                  onChange={(e) => setAliasToValue(e.target.value)}
                  sx={{ width: 150 }}
                />
                
                <Button
                  size="small"
                  onClick={() => {
                    if (selectedAliasFrom && aliasToValue.trim()) {
                      const newAliases = {
                        ...(localAgent.toolAliases || {}),
                        [selectedAliasFrom]: aliasToValue.trim()
                      };
                      updateLocalAgent('toolAliases', newAliases);
                      // Reset form
                      setSelectedAliasFrom('');
                      setAliasToValue('');
                    }
                  }}
                >
                  Add
                </Button>
              </Box>
            </Box>

            <Divider sx={{ my: 3 }} />

            {/* Tool Settings Section */}
            <Box>
              <Typography variant="h6" gutterBottom>Tool Settings</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Configure specific tool permissions and settings
              </Typography>
              
              {/* Existing configured tools */}
              {Object.keys(localAgent.toolsSettings || {}).length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle2" gutterBottom>Configured Tools:</Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {Object.entries(localAgent.toolsSettings || {}).map(([toolName, settings]) => (
                      <Box key={toolName}>
                        {/* Tool Header */}
                        <Box 
                          sx={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 1, 
                            p: 1, 
                            border: 1, 
                            borderColor: expandedTool === toolName ? 'primary.main' : 'divider',
                            borderRadius: 1, 
                            mb: 1,
                            cursor: 'pointer',
                            '&:hover': { borderColor: 'primary.light' }
                          }}
                          onClick={() => setExpandedTool(expandedTool === toolName ? '' : toolName)}
                        >
                          <Typography variant="body2" sx={{ flex: 1, fontWeight: 'medium' }}>{toolName}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {Object.keys(settings).length} setting(s)
                          </Typography>
                          <Button
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              const { [toolName]: removed, ...rest } = localAgent.toolsSettings || {};
                              updateLocalAgent('toolsSettings', rest);
                              if (expandedTool === toolName) {
                                setExpandedTool('');
                              }
                            }}
                            color="error"
                          >
                            Remove All
                          </Button>
                        </Box>
                        
                        {/* Individual Properties - Only show if expanded */}
                        {expandedTool === toolName && (
                          <Box sx={{ ml: 2, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            {Object.entries(settings).map(([propertyName, propertyValue]) => (
                              <Box 
                                key={propertyName} 
                                sx={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: 1, 
                                  p: 1, 
                                  border: 1, 
                                  borderColor: 'grey.300',
                                  borderRadius: 1,
                                  cursor: 'pointer',
                                  '&:hover': { 
                                    borderColor: 'primary.light',
                                    bgcolor: 'primary.50'
                                  }
                                }}
                                onClick={() => populateFormWithSetting(toolName, propertyName, propertyValue)}
                              >
                                <Typography variant="body2" sx={{ minWidth: 120, fontWeight: 'medium' }}>
                                  {propertyName}:
                                </Typography>
                                <Typography variant="body2" sx={{ flex: 1, fontFamily: 'monospace', fontSize: '0.875rem' }}>
                                  {typeof propertyValue === 'object' ? JSON.stringify(propertyValue) : String(propertyValue)}
                                </Typography>
                                <IconButton
                                  size="small"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removePropertyFromTool(toolName, propertyName);
                                  }}
                                  color="error"
                                >
                                  <Delete fontSize="small" />
                                </IconButton>
                              </Box>
                            ))}
                          </Box>
                        )}
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}
              
              {/* Add new tool settings */}
              <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}>
                <Typography variant="subtitle2" gutterBottom>Add Tool Setting</Typography>
                
                {/* Select Tool */}
                <FormControl size="small" sx={{ minWidth: 200, mb: 2 }}>
                  <InputLabel>Select tool</InputLabel>
                  <Select
                    value={selectedToolForSettings}
                    label="Select tool"
                    onChange={(e) => setSelectedToolForSettings(e.target.value)}
                  >
                    {/* Built-in tools - only if selected */}
                    {builtInTools
                      .filter(tool => isToolEnabled(tool))
                      .map(tool => (
                        <MenuItem key={tool} value={tool}>
                          {tool}
                        </MenuItem>
                      ))}
                    
                    {/* Individual MCP tools - only if selected */}
                    {Object.entries(mcpTools).map(([serverName, tools]) => 
                      tools
                        .filter(toolObj => {
                          const toolName = typeof toolObj === 'string' ? toolObj : toolObj.name;
                          return isMcpToolEnabled(serverName, toolName);
                        })
                        .map(toolObj => {
                          const toolName = typeof toolObj === 'string' ? toolObj : toolObj.name;
                          const fullToolName = `@${serverName}/${toolName}`;
                          return (
                            <MenuItem key={fullToolName} value={fullToolName}>
                              @{serverName}/{toolName}
                            </MenuItem>
                          );
                        })
                    )}
                  </Select>
                </FormControl>
                
                {selectedToolForSettings && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    
                    {/* Setting Name */}
                    <Box>
                      <Typography variant="body2" gutterBottom>Setting Name:</Typography>
                      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 1 }}>
                        <FormControlLabel
                          control={<input type="radio" checked={settingNameMode === 'common'} onChange={() => setSettingNameMode('common')} />}
                          label="Common"
                        />
                        <FormControlLabel
                          control={<input type="radio" checked={settingNameMode === 'custom'} onChange={() => setSettingNameMode('custom')} />}
                          label="Custom"
                        />
                      </Box>
                      
                      {settingNameMode === 'common' ? (
                        <FormControl size="small" sx={{ minWidth: 200 }}>
                          <InputLabel>Common setting</InputLabel>
                          <Select
                            value={commonSettingName}
                            label="Common setting"
                            onChange={(e) => setCommonSettingName(e.target.value)}
                          >
                            {getCommonSettings(selectedToolForSettings).map(setting => (
                              <MenuItem key={setting} value={setting}>
                                {setting}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      ) : (
                        <TextField
                          size="small"
                          placeholder="Custom setting name"
                          value={customSettingName}
                          onChange={(e) => setCustomSettingName(e.target.value)}
                          sx={{ width: 200 }}
                        />
                      )}
                    </Box>
                    
                    {/* Value Type */}
                    <Box>
                      <Typography variant="body2" gutterBottom>Value Type:</Typography>
                      <FormControl component="fieldset">
                        <Box sx={{ display: 'flex', gap: 2 }}>
                          <FormControlLabel
                            control={<input type="radio" checked={valueType === 'array'} onChange={() => setValueType('array')} />}
                            label="Array"
                          />
                          <FormControlLabel
                            control={<input type="radio" checked={valueType === 'single'} onChange={() => setValueType('single')} />}
                            label="Single Value"
                          />
                          <FormControlLabel
                            control={<input type="radio" checked={valueType === 'keyvalue'} onChange={() => setValueType('keyvalue')} />}
                            label="Key-Value Object"
                          />
                        </Box>
                      </FormControl>
                    </Box>
                    
                    {/* Glob Pattern Help for Path Settings */}
                    {isPathBasedSetting(settingNameMode === 'common' ? commonSettingName : customSettingName) && (
                      <Alert severity="info" sx={{ mb: 0 }}>
                        <Typography variant="body2" gutterBottom sx={{ fontWeight: 'bold' }}>
                          Glob Pattern Support
                        </Typography>
                        <Typography variant="caption" component="div" sx={{ mb: 0.5 }}>
                          Path settings use gitignore-style glob patterns:
                        </Typography>
                        <Box component="ul" sx={{ mt: 0.5, mb: 0, pl: 2, '& li': { mb: 0.25 } }}>
                          <Typography variant="caption" component="li">
                            <code>~/projects</code> - Matches directory and all children recursively
                          </Typography>
                          <Typography variant="caption" component="li">
                            <code>./src/**</code> - All files under src/ directory
                          </Typography>
                          <Typography variant="caption" component="li">
                            <code>*.txt</code> - All .txt files in current directory
                          </Typography>
                          <Typography variant="caption" component="li">
                            <code>**/*.md</code> - All .md files in any subdirectory
                          </Typography>
                        </Box>
                      </Alert>
                    )}
                    
                    {/* Value Input based on type */}
                    <Box>
                      <Typography variant="body2" gutterBottom>Value:</Typography>
                      
                      {valueType === 'array' && (
                        <Box>
                          {settingValues.map((value, index) => (
                            <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1 }}>
                              <TextField
                                size="small"
                                placeholder="Value"
                                value={value}
                                onChange={(e) => {
                                  const newValues = [...settingValues];
                                  newValues[index] = e.target.value;
                                  setSettingValues(newValues);
                                }}
                                sx={{ width: 250 }}
                              />
                              <Button size="small" onClick={() => setSettingValues(prev => prev.filter((_, i) => i !== index))}>
                                Remove
                              </Button>
                            </Box>
                          ))}
                          <Button size="small" onClick={() => setSettingValues(prev => [...prev, ''])}>
                            + Add Value
                          </Button>
                          <UniversalPathBrowser
                            label="Browse"
                            onSelect={handleToolSettingsFileSelect}
                            buttonProps={{ size: "small" }}
                          />
                        </Box>
                      )}
                      
                      {valueType === 'single' && (
                        <TextField
                          size="small"
                          placeholder="Single value (e.g., true, 5000, $USER)"
                          value={singleValue}
                          onChange={(e) => setSingleValue(e.target.value)}
                          sx={{ width: 300 }}
                        />
                      )}
                      
                      {valueType === 'keyvalue' && (
                        <Box>
                          {keyValuePairs.map((pair, index) => (
                            <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1 }}>
                              <TextField
                                size="small"
                                placeholder="Key"
                                value={pair.key}
                                onChange={(e) => {
                                  const newPairs = [...keyValuePairs];
                                  newPairs[index].key = e.target.value;
                                  setKeyValuePairs(newPairs);
                                }}
                                sx={{ width: 120 }}
                              />
                              <TextField
                                size="small"
                                placeholder="Value"
                                value={pair.value}
                                onChange={(e) => {
                                  const newPairs = [...keyValuePairs];
                                  newPairs[index].value = e.target.value;
                                  setKeyValuePairs(newPairs);
                                }}
                                sx={{ width: 120 }}
                              />
                              <Button size="small" onClick={() => setKeyValuePairs(prev => prev.filter((_, i) => i !== index))}>
                                Remove
                              </Button>
                            </Box>
                          ))}
                          <Button size="small" onClick={() => setKeyValuePairs(prev => [...prev, { key: '', value: '' }])}>
                            + Add Pair
                          </Button>
                        </Box>
                      )}
                    </Box>
                    
                    {/* Add Setting Button */}
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => {
                        const settingName = settingNameMode === 'common' ? commonSettingName : customSettingName;
                        if (!settingName) return;
                        
                        let settingValueToAdd;
                        if (valueType === 'array') {
                          settingValueToAdd = settingValues.filter(v => v.trim()).map(v => v.trim());
                          if (settingValueToAdd.length === 0) return;
                        } else if (valueType === 'single') {
                          if (!singleValue.trim()) return;
                          // Try to parse as boolean or number, otherwise keep as string
                          const trimmed = singleValue.trim();
                          if (trimmed === 'true') settingValueToAdd = true;
                          else if (trimmed === 'false') settingValueToAdd = false;
                          else if (!isNaN(trimmed) && !isNaN(parseFloat(trimmed))) settingValueToAdd = parseFloat(trimmed);
                          else settingValueToAdd = trimmed;
                        } else if (valueType === 'keyvalue') {
                          settingValueToAdd = {};
                          keyValuePairs.forEach(pair => {
                            if (pair.key.trim() && pair.value.trim()) {
                              settingValueToAdd[pair.key.trim()] = pair.value.trim();
                            }
                          });
                          if (Object.keys(settingValueToAdd).length === 0) return;
                        }
                        
                        const currentSettings = localAgent.toolsSettings || {};
                        const toolSettings = currentSettings[selectedToolForSettings] || {};
                        
                        // Always replace the value (no merging for editing)
                        const newValue = settingValueToAdd;
                        
                        const newToolSettings = { ...toolSettings, [settingName]: newValue };
                        const newSettings = { ...currentSettings, [selectedToolForSettings]: newToolSettings };
                        
                        updateLocalAgent('toolsSettings', newSettings);
                        
                        // Reset form
                        setCommonSettingName('');
                        setCustomSettingName('');
                        setSettingValues(['']);
                        setSingleValue('');
                        setKeyValuePairs([{ key: '', value: '' }]);
                      }}
                      sx={{ alignSelf: 'flex-start' }}
                    >
                      Add Setting to Tool
                    </Button>
                    
                  </Box>
                )}
              </Box>
            </Box>

            <Divider sx={{ my: 3 }} />

            {/* Subagent Configuration Section */}
            <Box>
              <Typography variant="h6" gutterBottom>Subagent Configuration</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Control which agents can be spawned as subagents
              </Typography>

              {/* Available Agents */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" gutterBottom>Available Agents</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                  {getSubagentSetting('availableAgents').map((name, i) => (
                    <Chip key={i} label={name} size="small"
                      color={name.includes('*') || name.includes('?') ? 'warning' : 'default'}
                      onDelete={() => removeFromSubagentList('availableAgents', name)} />
                  ))}
                </Box>
                <FormControl size="small" sx={{ minWidth: 250, mb: 1 }}>
                  <InputLabel>Add agent</InputLabel>
                  <Select value="" label="Add agent"
                    onChange={(e) => addToSubagentList('availableAgents', e.target.value)}>
                    {knownAgents.filter(n => n !== localAgent.name && !getSubagentSetting('availableAgents').includes(n))
                      .map(n => <MenuItem key={n} value={n}>{n}</MenuItem>)}
                  </Select>
                </FormControl>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField size="small" placeholder="Glob pattern e.g. docs-*"
                    value={availableGlobPattern} onChange={(e) => setAvailableGlobPattern(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && availableGlobPattern.trim()) {
                        addToSubagentList('availableAgents', availableGlobPattern.trim());
                        setAvailableGlobPattern('');
                      }
                    }}
                    sx={{ flex: 1 }} />
                  <Button size="small" variant="outlined" onClick={() => {
                    if (availableGlobPattern.trim()) {
                      addToSubagentList('availableAgents', availableGlobPattern.trim());
                      setAvailableGlobPattern('');
                    }
                  }}>Add</Button>
                </Box>
              </Box>

              {/* Trusted Agents */}
              <Box>
                <Typography variant="subtitle2" gutterBottom>Trusted Agents</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Run without permission prompts
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                  {getSubagentSetting('trustedAgents').map((name, i) => (
                    <Chip key={i} label={name} size="small" color={name.includes('*') || name.includes('?') ? 'warning' : 'success'}
                      onDelete={() => removeFromSubagentList('trustedAgents', name)} />
                  ))}
                </Box>
                <FormControl size="small" sx={{ minWidth: 250, mb: 1 }}>
                  <InputLabel>Add from available</InputLabel>
                  <Select value="" label="Add from available"
                    onChange={(e) => addToSubagentList('trustedAgents', e.target.value)}>
                    {getSubagentSetting('availableAgents')
                      .filter(n => !n.includes('*') && !n.includes('?') && !getSubagentSetting('trustedAgents').includes(n))
                      .map(n => <MenuItem key={n} value={n}>{n}</MenuItem>)}
                  </Select>
                </FormControl>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField size="small" placeholder="Glob pattern e.g. test-*"
                    value={trustedGlobPattern} onChange={(e) => setTrustedGlobPattern(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && trustedGlobPattern.trim()) {
                        addToSubagentList('trustedAgents', trustedGlobPattern.trim());
                        setTrustedGlobPattern('');
                      }
                    }}
                    sx={{ flex: 1 }} />
                  <Button size="small" variant="outlined" onClick={() => {
                    if (trustedGlobPattern.trim()) {
                      addToSubagentList('trustedAgents', trustedGlobPattern.trim());
                      setTrustedGlobPattern('');
                    }
                  }}>Add</Button>
                </Box>
              </Box>
            </Box>
            
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
                  ...(localAgent.tools && localAgent.tools.length > 0 && { tools: localAgent.tools }),
                  ...(localAgent.allowedTools && localAgent.allowedTools.length > 0 && { allowedTools: localAgent.allowedTools }),
                  ...(localAgent.toolAliases && Object.keys(localAgent.toolAliases).length > 0 && { toolAliases: localAgent.toolAliases }),
                  ...(localAgent.toolsSettings && Object.keys(localAgent.toolsSettings).length > 0 && { toolsSettings: localAgent.toolsSettings })
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

export default ToolConfigurationDialog;
