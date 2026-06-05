/**
 * @fileoverview List component for managing MCP servers assigned to an agent.
 */
import React, { useState } from 'react';
import {
  Box,
  Typography,
  Switch,
  IconButton,
  Card,
  CardContent,
  Chip,
  Menu,
  MenuItem,
  CircularProgress
} from '@mui/material';
import {
  MoreVert,
  Edit,
  Delete
} from '@mui/icons-material';

const AgentMCPServerList = ({ 
  servers, 
  onServerToggle, 
  onServerRemove,
  onServerEdit,
  serverTools = {},
  loadingTools = {},
  disabledTools = {},
  onToolToggle,
  onHighlightJson
}) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const [menuServer, setMenuServer] = useState(null);
  const [expandedTools, setExpandedTools] = useState(new Set());

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
    if (menuServer) {
      onServerEdit(menuServer.name);
    }
    handleMenuClose();
  };

  const handleDelete = () => {
    if (menuServer) {
      onServerRemove(menuServer.name);
    }
    handleMenuClose();
  };

  return (
    <Box>
      {servers.map((server) => (
        <Card
          key={server.name}
          onClick={() => onHighlightJson && onHighlightJson([`mcpServers.${server.name}`])}
          sx={{
            mb: 1,
            border: 1,
            borderColor: 'divider',
            '&:hover': { borderColor: 'primary.light', cursor: 'pointer' },
            opacity: server.enabled ? 1 : 0.5,
            transition: 'opacity 0.2s'
          }}
        >
          <CardContent sx={{ pb: 1, '&:last-child': { pb: 1 } }}>
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
                  onServerToggle(server.name);
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

            {/* Tools chip - replaces server type text */}
            {loadingTools[server.name] && (
              <Box sx={{ mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={14} />
                <Typography variant="caption" color="text.secondary">Loading tools...</Typography>
              </Box>
            )}
            {!loadingTools[server.name] && serverTools[server.name]?.length > 0 && (
              <Box sx={{ mb: 0.5 }}>
                <Chip 
                  label={`${serverTools[server.name].length} tools ${expandedTools.has(server.name) ? '▲' : '▼'}`}
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
              </Box>
            )}

            {/* Tools List - shown when expanded */}
            {!loadingTools[server.name] && serverTools[server.name]?.length > 0 && expandedTools.has(server.name) && (
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
                      return totalTools > 0 && disabledCount === 0;
                    })()}
                    onChange={(e) => {
                      e.stopPropagation();
                      const enableAll = e.target.checked;
                      const serverToolsList = serverTools[server.name] || [];
                      
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
      ))}

      {servers.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="body2" color="text.secondary">
            No servers configured
          </Typography>
        </Box>
      )}

      {/* Three-dot Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handleEdit}>
          <Edit fontSize="small" sx={{ mr: 1 }} />
          Edit
        </MenuItem>
        <MenuItem onClick={handleDelete}>
          <Delete fontSize="small" sx={{ mr: 1 }} />
          Delete
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default AgentMCPServerList;
