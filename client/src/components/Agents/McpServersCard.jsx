/**
 * @fileoverview Card for managing MCP server assignments on an agent.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  Box,
  IconButton,
  Collapse,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Switch
} from '@mui/material';
import {
  ExpandMore,
  ExpandLess,
  Storage,
  Add
} from '@mui/icons-material';
import AddServerDialog from '../MCPWorkbench/AddServerDialog';
import AgentMCPServerList from './AgentMCPServerList';
import { mcpService } from '../../services/api';

const McpServersCard = ({ agent, onAgentChange, onHighlightJson, isActive }) => {
  const [expanded, setExpanded] = useState(false);
  const [addServerDialog, setAddServerDialog] = useState(false);
  const [newServerJson, setNewServerJson] = useState('');
  const [newServerValid, setNewServerValid] = useState(null);
  const [newServerError, setNewServerError] = useState('');
  const [serverTools, setServerTools] = useState({});
  const [disabledTools, setDisabledTools] = useState({});
  const saveTimeoutRef = useRef(null);
  const [globalServers, setGlobalServers] = useState({});
  const [renameDialog, setRenameDialog] = useState({ open: false, serverName: '', newName: '', serverConfig: null });
  const [isEditingServer, setIsEditingServer] = useState(false);

  // Load global MCP servers
  useEffect(() => {
    const loadGlobalServers = async () => {
      try {
        const response = await mcpService.getConfig();
        setGlobalServers(response.data.data?.mcpServers || {});
      } catch (error) {
        console.error('Failed to load global MCP servers:', error);
      }
    };
    loadGlobalServers();
  }, []);

  // Load disabled tools from agent's server configs
  useEffect(() => {
    const loaded = {};
    const mcpServers = agent.mcpServers || {};
    
    Object.entries(mcpServers).forEach(([serverName, serverConfig]) => {
      if (serverConfig.disabledTools && Array.isArray(serverConfig.disabledTools)) {
        loaded[serverName] = new Set(serverConfig.disabledTools);
      }
    });
    
    setDisabledTools(loaded);
  }, [agent.name, JSON.stringify(agent.mcpServers)]); // Reload when agent or servers change

  // Load tools when servers change
  useEffect(() => {
    if (agent.mcpServers && Object.keys(agent.mcpServers).length > 0) {
      loadMCPTools();
    }
  }, [JSON.stringify(agent.mcpServers)]);

  const loadMCPTools = async () => {
    try {
      const servers = agent.mcpServers;
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
      setServerTools(results);
    } catch (error) {
      console.error('Failed to load MCP tools:', error);
    }
  };

  const handleCardClick = () => {
    onHighlightJson(['mcpServers']);
  };

  const updateField = (field, value) => {
    onAgentChange({ ...agent, [field]: value });
  };

  // Add Server Handlers
  const handleAddServerDialog = () => {
    setIsEditingServer(false);
    setAddServerDialog(true);
  };

  const handleAddServerCancel = () => {
    setAddServerDialog(false);
    setNewServerJson('');
    setNewServerValid(null);
    setNewServerError('');
    setIsEditingServer(false);
  };

  const handleNewServerJsonChange = (value) => {
    setNewServerJson(value);
    try {
      JSON.parse(value);
      setNewServerValid(true);
      setNewServerError('');
    } catch (error) {
      setNewServerValid(false);
      setNewServerError(error.message);
    }
  };

  const handleConvertToWSL = () => {
    try {
      const parsed = JSON.parse(newServerJson);
      let modified = false;
      
      const convertCommands = (obj) => {
        if (obj && typeof obj === 'object') {
          if (obj.command && typeof obj.command === 'string' && !obj.command.startsWith('wsl.exe')) {
            obj.command = `wsl.exe ${obj.command}`;
            modified = true;
          }
          Object.values(obj).forEach(val => {
            if (typeof val === 'object') convertCommands(val);
          });
        }
      };
      
      convertCommands(parsed);
      
      if (modified) {
        setNewServerJson(JSON.stringify(parsed, null, 2));
      }
    } catch (error) {
      console.error('Failed to convert to WSL:', error);
    }
  };

  const handleAddServerSubmit = () => {
    if (newServerValid !== true) return;
    
    try {
      let serverConfig = JSON.parse(newServerJson);
      
      // Strip mcpServers wrapper if present
      if (serverConfig.mcpServers) {
        serverConfig = serverConfig.mcpServers;
      }
      
      const serverNames = Object.keys(serverConfig);
      const serverName = serverNames[0];
      
      // Check for duplicates (only when adding, not editing)
      if (!isEditingServer) {
        const existingServerNames = Object.keys(agent.mcpServers || {});
        const duplicates = serverNames.filter(name => existingServerNames.includes(name));
        
        if (duplicates.length > 0) {
          setNewServerError(`Server already exists: ${duplicates.join(', ')}`);
          return;
        }
      }
      
      // Add to agent
      const currentServers = agent.mcpServers || {};
      updateField('mcpServers', { ...currentServers, ...serverConfig });
      
      setAddServerDialog(false);
      setNewServerJson('');
      setNewServerValid(null);
      setNewServerError('');
    } catch (error) {
      setNewServerError('Failed to add server: ' + error.message);
    }
  };

  // Server List Handlers
  const handleToggleServer = (serverName) => {
    const currentServers = agent.mcpServers || {};
    const server = currentServers[serverName];
    
    updateField('mcpServers', {
      ...currentServers,
      [serverName]: { ...server, disabled: !server.disabled }
    });
  };

  const handleDeleteServer = (serverName) => {
    const currentServers = agent.mcpServers || {};
    const { [serverName]: removed, ...remainingServers } = currentServers;
    updateField('mcpServers', remainingServers);
  };

  const handleEditServer = (serverName) => {
    const currentServers = agent.mcpServers || {};
    const serverConfig = { [serverName]: currentServers[serverName] };
    setNewServerJson(JSON.stringify(serverConfig, null, 2));
    setNewServerValid(true);
    setIsEditingServer(true);
    setAddServerDialog(true);
  };

  // Add server from global config
  const handleAddFromGlobal = (serverName) => {
    if (!serverName) return;
    
    const currentServers = agent.mcpServers || {};
    const serverConfig = globalServers[serverName];
    
    // Check for duplicate
    if (currentServers[serverName]) {
      setRenameDialog({
        open: true,
        serverName,
        newName: `${serverName}-copy`,
        serverConfig
      });
      return;
    }
    
    // Add server
    updateField('mcpServers', {
      ...currentServers,
      [serverName]: serverConfig
    });
  };

  // Handle rename and add
  const handleRenameAndAdd = () => {
    const { newName, serverConfig } = renameDialog;
    const currentServers = agent.mcpServers || {};
    
    if (!newName.trim()) return;
    
    // Check if new name also exists
    if (currentServers[newName]) {
      alert(`Server "${newName}" already exists. Please choose a different name.`);
      return;
    }
    
    // Add with new name
    updateField('mcpServers', {
      ...currentServers,
      [newName]: serverConfig
    });
    
    setRenameDialog({ open: false, serverName: '', newName: '', serverConfig: null });
  };

  const handleToolToggle = (serverName, toolName, enabled) => {
    setDisabledTools(prev => {
      const currentServers = agent.mcpServers || {};
      const server = currentServers[serverName];
      
      if (!server) return prev;
      
      // Get current disabled tools
      const currentDisabled = new Set(prev[serverName] || server.disabledTools || []);
      
      // Update the set
      if (enabled) {
        currentDisabled.delete(toolName);
      } else {
        currentDisabled.add(toolName);
      }
      
      // Debounce the save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      saveTimeoutRef.current = setTimeout(() => {
        // Convert to array and update server config
        const disabledToolsArray = Array.from(currentDisabled);
        const updatedServer = { ...server };
        
        if (disabledToolsArray.length > 0) {
          updatedServer.disabledTools = disabledToolsArray;
        } else {
          delete updatedServer.disabledTools;
        }
        
        // Update agent config
        updateField('mcpServers', {
          ...currentServers,
          [serverName]: updatedServer
        });
      }, 300);
      
      return {
        ...prev,
        [serverName]: currentDisabled
      };
    });
  };

  const mcpServers = agent.mcpServers || {};
  const serverCount = Object.keys(mcpServers).length;

  // Convert servers object to array for MCPServerList
  const serversArray = Object.keys(mcpServers).map(serverName => {
    const serverConfig = mcpServers[serverName];
    return {
      name: serverName,
      ...serverConfig,  // Spread all fields including custom ones
      enabled: !serverConfig.disabled  // UI-specific computed field
    };
  });

  return (
    <Card 
      sx={{ 
        '&:hover': { 
          boxShadow: 2,
          borderColor: 'primary.light'
        },
        border: isActive ? 2 : 1,
        borderColor: isActive ? 'primary.main' : 'divider'
      }}
    >
      <CardHeader
        avatar={<Storage color="primary" />}
        title="MCP Servers"
        subheader={`${serverCount} servers configured`}
        action={
          <IconButton onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        }
        onClick={handleCardClick}
        sx={{ cursor: 'pointer' }}
      />
      
      <Collapse in={expanded}>
        <CardContent onClick={(e) => e.stopPropagation()}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            
            {/* Include Global MCP Servers Toggle */}
            <FormControlLabel
              control={
                <Switch
                  checked={agent.includeMcpJson === true}
                  onChange={(e) => updateField('includeMcpJson', e.target.checked || undefined)}
                  size="small"
                />
              }
              label="Include global mcp.json servers"
            />

            {/* Add from global MCP servers dropdown */}
            <FormControl fullWidth>
              <InputLabel>Add From Global MCP Servers</InputLabel>
              <Select
                value=""
                onChange={(e) => handleAddFromGlobal(e.target.value)}
                label="Add From Global MCP Servers"
              >
                <MenuItem value="">
                  <em>Select a server to add</em>
                </MenuItem>
                {Object.keys(globalServers).map((serverName) => (
                  <MenuItem key={serverName} value={serverName}>
                    {serverName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={handleAddServerDialog}
              fullWidth
            >
              Add MCP Server
            </Button>

            {serverCount > 0 && (
              <AgentMCPServerList
                servers={serversArray}
                onServerToggle={handleToggleServer}
                onServerRemove={handleDeleteServer}
                onServerEdit={handleEditServer}
                serverTools={serverTools}
                disabledTools={disabledTools}
                onToolToggle={handleToolToggle}
                onHighlightJson={onHighlightJson}
              />
            )}
            
          </Box>
        </CardContent>
      </Collapse>

      <AddServerDialog
        open={addServerDialog}
        onClose={handleAddServerCancel}
        newServerJson={newServerJson}
        onJsonChange={handleNewServerJsonChange}
        newServerValid={newServerValid}
        newServerError={newServerError}
        onConvertToWSL={handleConvertToWSL}
        onSubmit={handleAddServerSubmit}
        isEditing={isEditingServer}
      />

      {/* Rename Dialog */}
      <Dialog open={renameDialog.open} onClose={() => setRenameDialog({ open: false, serverName: '', newName: '', serverConfig: null })}>
        <DialogTitle>Server Already Exists</DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2 }}>
            Server "{renameDialog.serverName}" already exists in this agent. Please provide a new name to add it.
          </Box>
          <TextField
            fullWidth
            label="New Server Name"
            value={renameDialog.newName}
            onChange={(e) => setRenameDialog(prev => ({ ...prev, newName: e.target.value }))}
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialog({ open: false, serverName: '', newName: '', serverConfig: null })}>
            Cancel
          </Button>
          <Button onClick={handleRenameAndAdd} variant="contained" disabled={!renameDialog.newName.trim()}>
            Add with New Name
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default McpServersCard;
