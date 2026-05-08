/**
 * @fileoverview List component for displaying and managing MCP servers in the workbench.
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  Switch,
  IconButton,
  Button,
  Card,
  CardContent,
  Chip,
  Menu,
  MenuItem,
  Stack
} from '@mui/material';
import {
  Add,
  MoreVert,
  ContentCopy,
  CheckCircle,
  Error,
  Delete,
  Edit
} from '@mui/icons-material';

const MCPServerList = ({ 
  servers, 
  onServerToggle, 
  onServerAdd, 
  onServerRemove,
  onServerEdit,
  onServerSelect, 
  selectedServer,
  serverTools = {},
  disabledTools = {},
  onToolToggle
}) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const [menuServer, setMenuServer] = useState(null);
  const [expandedTools, setExpandedTools] = useState(new Set()); // Track expanded tool lists
  
  // Scroll position preservation
  const scrollContainerRef = useRef(null);
  const savedScrollPosition = useRef(0);

  // Save scroll position before any state changes
  const saveScrollPosition = () => {
    if (scrollContainerRef.current) {
      savedScrollPosition.current = scrollContainerRef.current.scrollTop;
    }
  };

  // Restore scroll position after state changes
  const restoreScrollPosition = () => {
    if (scrollContainerRef.current && savedScrollPosition.current > 0) {
      scrollContainerRef.current.scrollTop = savedScrollPosition.current;
    }
  };

  // Restore scroll position when servers change
  useEffect(() => {
    restoreScrollPosition();
  }, [servers]);

  // Enhanced toggle handler that preserves scroll
  const handleServerToggle = (serverName, enabled) => {
    saveScrollPosition();
    onServerToggle(serverName, enabled);
  };

  // Real server data
  const getServerStatus = (server) => {
    // Return actual status from server testing
    return server.status || 'unknown';
  };

  const getToolCount = (server) => {
    // Check various possible properties for tool count
    if (server.tools && Array.isArray(server.tools)) return server.tools.length;
    if (server.toolCount) return server.toolCount;
    if (server.capabilities && server.capabilities.tools) return server.capabilities.tools.length;
    // If server has args, show that as indication of configuration
    if (server.args && server.args.length > 0) return server.args.length;
    return 0;
  };

  const handleMenuOpen = (event, server) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setMenuServer(server);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setMenuServer(null);
  };

  const handleEdit = () => {
    if (menuServer && onServerEdit) {
      onServerEdit(menuServer);
    }
    handleMenuClose();
  };

  const handleDuplicate = () => {
    if (menuServer) {
      const duplicatedServer = {
        ...menuServer,
        name: `${menuServer.name}-copy`
      };
      onServerAdd(duplicatedServer);
    }
    handleMenuClose();
  };

  const handleRemove = () => {
    if (menuServer && onServerRemove) {
      onServerRemove(menuServer.name);
    }
    handleMenuClose();
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'connected': return <CheckCircle sx={{ color: '#4caf50' }} />;
      case 'failed': return <Error sx={{ color: '#f44336' }} />;
      default: return null;
    }
  };

  return (
    <Box sx={{ width: '100%', borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h6" gutterBottom>MCP Servers</Typography>
        
        {/* Configuration Scope - Temporarily hidden for cleaner UI */}
        {/*
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Configuration Scope</Typography>
          <Stack direction="row" spacing={2} sx={{ mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="radio"
                id="scope-global"
                name="scope"
                value="global"
                checked={scope === 'global'}
                onChange={(e) => onScopeChange(e.target.value)}
                style={{ marginRight: '8px' }}
              />
              <label htmlFor="scope-global">Global</label>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="radio"
                id="scope-workspace"
                name="scope"
                value="workspace"
                checked={scope === 'workspace'}
                onChange={(e) => onScopeChange(e.target.value)}
                style={{ marginRight: '8px' }}
              />
              <label htmlFor="scope-workspace">Workspace</label>
            </Box>
          </Stack>
          
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <Autocomplete
              freeSolo
              options={pathSuggestions}
              value={tempWorkspacePath}
              onInputChange={handlePathInputChange}
              disabled={scope === 'global'}
              ListboxProps={{
                style: { maxHeight: 200, overflow: 'auto' }
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  size="small"
                  placeholder="Enter workspace path (e.g., /home/user/my-project)"
                  sx={{ flex: 1 }}
                />
              )}
              sx={{ flex: 1 }}
            />
            <Button
              variant="outlined"
              startIcon={<Check />}
              onClick={handleApplyWorkspace}
              disabled={scope === 'global' || !tempWorkspacePath.trim()}
              size="small"
            >
              Apply
            </Button>
          </Stack>
        </Box>
        */}

        {/* Action Buttons */}
        <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
          <Button
            fullWidth
            variant="outlined"
            startIcon={<Add />}
            onClick={() => onServerAdd()}
            size="small"
          >
            Add Server
          </Button>
        </Stack>
      </Box>

      {/* Server Cards */}
      <Box 
        ref={scrollContainerRef}
        sx={{ flex: 1, overflow: 'auto', p: 1 }} 
        data-server-list-container
      >
        {servers.map((server, index) => {
          const status = getServerStatus(server);
          const isSelected = selectedServer === server.name;

          return (
            <Card
              key={server.name}
              sx={{
                mb: 1,
                cursor: 'pointer',
                border: isSelected ? 2 : 1,
                borderColor: isSelected ? 'primary.main' : 'divider',
                '&:hover': { borderColor: 'primary.light' },
                opacity: server.enabled ? 1 : 0.5,
                transition: 'opacity 0.2s'
              }}
              onClick={() => onServerSelect(server.name)}
            >
              <CardContent sx={{ pb: 1 }}>
                {/* Header Row */}
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 600 }}>
                    {server.name}
                  </Typography>
                  <Switch
                    size="small"
                    checked={server.enabled}
                    onChange={(e) => {
                      e.stopPropagation();
                      onServerToggle(server.name, e.target.checked);
                    }}
                    sx={{
                      mr: 0.5,
                      '& .MuiSwitch-switchBase.Mui-checked': {
                        color: 'success.main',
                      },
                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                        backgroundColor: 'success.main',
                      },
                      '& .MuiSwitch-switchBase': {
                        color: 'error.main',
                      },
                      '& .MuiSwitch-track': {
                        backgroundColor: 'error.main',
                      },
                    }}
                  />
                  <IconButton
                    size="small"
                    onClick={(e) => handleMenuOpen(e, server)}
                  >
                    <MoreVert />
                  </IconButton>
                </Box>

                {/* Status Row */}
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  {getStatusIcon(status)}
                  {status !== 'unknown' && (
                    <Typography variant="caption" sx={{ ml: 1, flex: 1 }}>
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </Typography>
                  )}
                  {serverTools[server.name]?.length > 0 && (
                    <Chip 
                      label={`${serverTools[server.name]?.length || 0} tools ${expandedTools.has(server.name) ? '▲' : '▼'}`}
                      size="small" 
                      variant="outlined"
                      color="primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        const newExpanded = new Set(expandedTools);
                        if (expandedTools.has(server.name)) {
                          newExpanded.delete(server.name);
                        } else {
                          newExpanded.add(server.name);
                        }
                        setExpandedTools(newExpanded);
                      }}
                      sx={{ cursor: 'pointer' }}
                    />
                  )}
                </Box>

                {/* Tools List */}
                {serverTools[server.name]?.length > 0 && expandedTools.has(server.name) && (
                  <Box sx={{ mt: 1 }}>
                    {/* Enable/Disable All Tools Toggle */}
                    <Box sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      py: 0.5,
                      mb: 1,
                      borderBottom: '2px solid',
                      borderColor: 'primary.main',
                      backgroundColor: 'action.hover'
                    }}>
                      <Box>
                        <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                          All Tools
                        </Typography>
                            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontSize: '0.65rem' }}>
                              Enable/disable all tools for this server
                            </Typography>
                          </Box>
                          <Switch
                            size="small"
                            checked={(() => {
                              const serverDisabledTools = disabledTools[server.name] || new Set();
                              const totalTools = serverTools[server.name]?.length || 0;
                              const disabledCount = serverDisabledTools.size;
                              // Checked if ALL tools are enabled (no disabled tools)
                              return totalTools > 0 && disabledCount === 0;
                            })()}
                            onChange={(e) => {
                              e.stopPropagation();
                              const enableAll = e.target.checked;
                              const serverToolsList = serverTools[server.name] || [];
                              
                              // Toggle all tools for this server
                              serverToolsList.forEach(tool => {
                                onToolToggle(server.name, tool.name, enableAll);
                              });
                            }}
                            disabled={!server.enabled}
                          />
                        </Box>
                        
                        {/* Individual Tool Toggles */}
                        {serverTools[server.name].map((tool) => {
                          const isToolDisabled = disabledTools[server.name]?.has(tool.name) || false;
                          return (
                            <Box key={tool.name} sx={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'space-between',
                              py: 0.5,
                              borderBottom: '1px solid',
                              borderColor: 'divider'
                            }}>
                              <Box>
                                <Typography variant="caption" sx={{ fontWeight: 500 }}>
                                  {tool.name}
                                </Typography>
                                {tool.description && (
                                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.65rem' }}>
                                    {tool.description.slice(0, 50)}...
                                  </Typography>
                                )}
                              </Box>
                              <Switch
                                size="small"
                                checked={!isToolDisabled}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  onToolToggle(server.name, tool.name, e.target.checked);
                                }}
                                disabled={!server.enabled}
                              />
                            </Box>
                          );
                        })}
                  </Box>
                )}

              </CardContent>
            </Card>
          );
        })}

        {servers.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="body2" color="text.secondary">
              No servers found
            </Typography>
          </Box>
        )}
      </Box>

      {/* Context Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handleEdit}>
          <Edit sx={{ mr: 1 }} />
          Edit
        </MenuItem>
        <MenuItem onClick={handleDuplicate}>
          <ContentCopy sx={{ mr: 1 }} />
          Duplicate
        </MenuItem>
        <MenuItem onClick={handleRemove} sx={{ color: 'error.main' }}>
          <Delete sx={{ mr: 1 }} />
          Remove
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default MCPServerList;
