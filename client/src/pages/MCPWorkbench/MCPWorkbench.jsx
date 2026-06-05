/**
 * @fileoverview MCP Workbench page for managing MCP server configurations and tools.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Typography, Alert } from '@mui/material';
import { useQuery, useQueryClient } from 'react-query';
import MCPServerList from '../../components/MCPWorkbench/MCPServerList';
import CustomJSONEditor from '../../components/MCPWorkbench/CustomJSONEditor';
import useResizablePanels from '../../hooks/useResizablePanels';
import usePersistedState from '../../hooks/usePersistedState';
import AddServerDialog from '../../components/MCPWorkbench/AddServerDialog';
import NotificationSnackbar from '../../components/common/NotificationSnackbar';
import LoadingOverlay from '../../components/common/LoadingOverlay';
import ResizableDivider from '../../components/common/ResizableDivider';
import { useNotification } from '../../hooks/useNotification';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { mcpService, fetchWithAuth } from '../../services/api';

const MCPWorkbench = () => {
  const { configPath } = useWorkspace();
  const [config, setConfig] = useState({
    mcpServers: {}
  });
  const [servers, setServers] = useState([]);
  const [selectedServer, setSelectedServer] = usePersistedState('mcpSelectedServer', null);
  useEffect(() => { setSelectedServer(null); }, [configPath]);
  const { notification, showNotification, hideNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [serverTools, setServerTools] = useState({});
  const [loadingTools, setLoadingTools] = useState({});
  const [disabledTools, setDisabledTools] = useState({});
  const { leftPanelWidth, isDragging, handleMouseDown } = useResizablePanels(40, 'mcpLeftPanelWidth', 20, 80);
  
  const [addServerDialog, setAddServerDialog] = useState(false);
  const [editServerDialog, setEditServerDialog] = useState(false);
  const [editingServer, setEditingServer] = useState(null);
  const [newServerJson, setNewServerJson] = useState('');
  const [newServerValid, setNewServerValid] = useState(null);
  const [newServerError, setNewServerError] = useState('');
  const toolToggleTimeoutRef = useRef(null);
  
  const queryClient = useQueryClient();

  // Get MCP servers
  const { data: mcpServers = [], refetch: refetchServers } = useQuery(
    ['mcpServers'], 
    () => mcpService.getAllMCPServers(),
    { 
      enabled: true,
      refetchOnWindowFocus: false,
      staleTime: 0
    }
  );

  // Load initial configuration
  useEffect(() => {
    loadMCPConfig();
  }, [configPath]);

  // Load disabled tools from config when config changes
  useEffect(() => {
    if (config.mcpServers) {
      const newDisabledTools = {};
      Object.keys(config.mcpServers).forEach(serverName => {
        const serverConfig = config.mcpServers[serverName];
        if (serverConfig.disabledTools && Array.isArray(serverConfig.disabledTools)) {
          newDisabledTools[serverName] = new Set(serverConfig.disabledTools);
        }
      });
      setDisabledTools(newDisabledTools);
    }
  }, [config]);

  // Sync servers with mcpServers data (same as MCPServers page)
  useEffect(() => {
    setServers(mcpServers);
  }, [mcpServers]);

  // Load tools when config changes
  useEffect(() => {
    if (config.mcpServers && Object.keys(config.mcpServers).length > 0) {
      loadMCPTools();
    }
  }, [JSON.stringify(config.mcpServers)]); // Only depend on mcpServers, not entire config

  const loadMCPTools = async () => {
    try {
      const servers = config.mcpServers;
      const results = {};
      const loading = {};
      Object.entries(servers).forEach(([name, cfg]) => {
        if (!cfg.disabled) loading[name] = true;
      });
      setLoadingTools(loading);

      await Promise.allSettled(
        Object.entries(servers).map(async ([name, cfg]) => {
          if (cfg.disabled) return;
          try {
            const response = await mcpService.getAgentTools({ [name]: cfg });
            if (response.data?.[name]) results[name] = response.data[name];
          } catch (err) {
            console.error(`Failed to load tools for ${name}:`, err);
            results[name] = [];
          } finally {
            setLoadingTools(prev => ({ ...prev, [name]: false }));
          }
        })
      );
      setServerTools(results);
    } catch (error) {
      console.error('Failed to load MCP tools:', error);
      setLoadingTools({});
    }
  };

  const loadMCPConfig = async () => {
    try {
      setLoading(true);
      const response = await mcpService.getConfig();
      const loadedConfig = response.data.data || { mcpServers: {} };
      setConfig(loadedConfig);
    } catch (error) {
      console.error('Failed to load MCP config:', error);
      showNotification('Failed to load MCP configuration', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getCurrentConfigPath = () => {
    return `${configPath}/settings/mcp.json`;
  };

  const handleConfigChange = (newConfig) => {
    setConfig(newConfig);
    
    // Sync servers state when config changes through JSON editor
    if (newConfig.mcpServers) {
      const newServers = Object.keys(newConfig.mcpServers).map(serverName => {
        const serverConfig = newConfig.mcpServers[serverName];
        return {
          name: serverName,
          ...serverConfig,  // Spread all fields including custom ones
          enabled: !serverConfig.disabled  // UI-specific computed field
        };
      });
      setServers(newServers);
    }
  };

  const handleSave = async (configToSave) => {
    try {
      const response = await fetchWithAuth('/api/mcp/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: configToSave
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to save config: ${response.statusText}`);
      }
      
      setConfig(configToSave);
      
    } catch (error) {
      console.error('Save failed:', error);
      showNotification(`Save failed: ${error.message}`, 'error');
      throw error;
    }
  };

  const handleServerToggle = (serverName, enabled) => {
    setConfig(prevConfig => {
      const server = { ...prevConfig.mcpServers[serverName] };
      if (enabled) {
        delete server.disabled;
      } else {
        server.disabled = true;
      }
      return {
        ...prevConfig,
        mcpServers: {
          ...prevConfig.mcpServers,
          [serverName]: server
        }
      };
    });
    setServers(prevServers =>
      prevServers.map(server =>
        server.name === serverName
          ? { ...server, enabled }
          : server
      )
    );
  };

  const handleToolToggle = (serverName, toolName, enabled) => {
    setDisabledTools(prev => {
      const serverDisabled = prev[serverName] || new Set();
      const newServerDisabled = new Set(serverDisabled);

      if (enabled) {
        newServerDisabled.delete(toolName);
      } else {
        newServerDisabled.add(toolName);
      }

      if (toolToggleTimeoutRef.current) {
        clearTimeout(toolToggleTimeoutRef.current);
      }

      toolToggleTimeoutRef.current = setTimeout(() => {
        const disabledToolsArray = Array.from(newServerDisabled);
        const currentServers = config.mcpServers || {};
        const server = currentServers[serverName];
        if (!server) return;

        const updatedServer = { ...server };
        if (disabledToolsArray.length > 0) {
          updatedServer.disabledTools = disabledToolsArray;
        } else {
          delete updatedServer.disabledTools;
        }

        setConfig(prevConfig => ({
          ...prevConfig,
          mcpServers: {
            ...prevConfig.mcpServers,
            [serverName]: updatedServer
          }
        }));
      }, 300);

      return {
        ...prev,
        [serverName]: newServerDisabled
      };
    });
  };

  const handleServerAdd = async (serverConfig) => {
    // If no config provided, open add server dialog
    if (!serverConfig) {
      setAddServerDialog(true);
      return;
    }

    const newConfig = {
      ...config,
      mcpServers: {
        ...config.mcpServers,
        [serverConfig.name]: {
          command: serverConfig.command,
          args: serverConfig.args,
          env: serverConfig.env || {},
          disabled: !serverConfig.enabled
        }
      }
    };
    setConfig(newConfig);
    
    // Update servers state immediately for UI responsiveness
    const newServer = {
      name: serverConfig.name,
      command: serverConfig.command,
      args: serverConfig.args,
      env: serverConfig.env || {},
      enabled: serverConfig.enabled !== false,
      disabled: !serverConfig.enabled
    };
    setServers(prevServers => [...prevServers, newServer]);
    
    setSelectedServer(serverConfig.name);
    showNotification(`Added ${serverConfig.name} server`, 'success');
    
    // Auto-save after adding server
    await handleSave(newConfig);
    
    // Delay cache invalidation to prevent overriding immediate UI update
    setTimeout(() => {
      queryClient.invalidateQueries('mcpServers');
    }, 100);
  };

  const handleServerRemove = (serverName) => {
    const newConfig = {
      ...config,
      mcpServers: { ...config.mcpServers }
    };
    
    delete newConfig.mcpServers[serverName];
    
    setConfig(newConfig);
    
    // Update servers state immediately for UI responsiveness
    setServers(prevServers => prevServers.filter(server => server.name !== serverName));
    
    // Clear selection if removed server was selected
    if (selectedServer === serverName) {
      setSelectedServer(null);
    }
    
    showNotification(`Removed ${serverName} server`, 'success');
    
    // Auto-save after removing server
    handleSave(newConfig);
    
    // Invalidate cache to keep React Query in sync
    queryClient.invalidateQueries('mcpServers');
  };

  // Add server dialog handlers
  const handleNewServerJsonChange = (value) => {
    setNewServerJson(value);
    
    // If empty, reset to no validation state
    if (!value.trim()) {
      setNewServerValid(null);
      setNewServerError('');
      return;
    }
    
    try {
      let parsed;
      let shouldUpdateDisplay = false;
      let updatedValue = value;
      
      // Comprehensive JSON cleanup
      let cleanValue = value.trim();
      
      // Remove common JSON issues
      cleanValue = cleanValue
        .replace(/,\s*}/g, '}')           // Remove trailing commas before }
        .replace(/,\s*]/g, ']')           // Remove trailing commas before ]
        .replace(/,\s*$/, '')             // Remove trailing comma at end
        .replace(/^\s*,/, '')             // Remove leading comma
        .replace(/,,+/g, ',')             // Replace multiple commas with single
        .replace(/:\s*,/g, ': null,')     // Replace empty values with null
        .replace(/"\s*:\s*"/g, '": "')    // Fix spacing around colons
        .replace(/'\s*:\s*'/g, '": "')    // Replace single quotes with double
        .replace(/'/g, '"')               // Convert all single quotes to double
        .replace(/([{,]\s*)(\w+):/g, '$1"$2":'); // Add quotes to unquoted keys
      
      // Try parsing as-is first
      try {
        parsed = JSON.parse(cleanValue);
      } catch (error) {
        // If it fails, try wrapping it in braces
        try {
          const wrappedValue = `{${cleanValue}}`;
          parsed = JSON.parse(wrappedValue);
          shouldUpdateDisplay = true;
          updatedValue = wrappedValue;
        } catch (wrapError) {
          throw error; // Use original error
        }
      }
      
      // Remove mcpServers wrapper if present
      if (parsed.mcpServers) {
        parsed = parsed.mcpServers;
        const unwrappedValue = JSON.stringify(parsed, null, 2);
        shouldUpdateDisplay = true;
        updatedValue = unwrappedValue;
      }
      
      // Update display if needed (but avoid infinite loop)
      if (shouldUpdateDisplay && updatedValue !== value) {
        setTimeout(() => setNewServerJson(updatedValue), 0);
      }
      
      // Valid if it's an object with server configurations
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        setNewServerValid(true);
        setNewServerError('');
      } else {
        setNewServerValid(false);
        setNewServerError('Must be an object containing server configurations');
      }
    } catch (error) {
      setNewServerValid(false);
      setNewServerError(error.message);
    }
  };

  const handleConvertToWSL = () => {
    if (!newServerValid) return;
    
    try {
      const serverConfig = JSON.parse(newServerJson);
      
      // Convert each server to WSL format
      Object.keys(serverConfig).forEach(serverName => {
        const server = serverConfig[serverName];
        if (server.command && server.command !== 'wsl.exe') {
          const originalCommand = server.command;
          const originalArgs = server.args || [];
          
          server.command = 'wsl.exe';
          server.args = ['-e', originalCommand, ...originalArgs];
        }
      });
      
      const formattedJson = JSON.stringify(serverConfig, null, 2);
      setNewServerJson(formattedJson);
    } catch (error) {
      setNewServerError('Failed to convert to WSL format: ' + error.message);
    }
  };

  const handleAddServerSubmit = async () => {
    if (newServerValid !== true) return;
    
    try {
      let serverConfig = JSON.parse(newServerJson);
      
      // Apply same processing as validation
      if (serverConfig.mcpServers) {
        serverConfig = serverConfig.mcpServers;
      }
      
      const serverNames = Object.keys(serverConfig);
      const serverName = serverNames[0];
      
      // Check for duplicate server names (only when adding, not editing)
      if (!editingServer) {
        const existingServerNames = Object.keys(config.mcpServers || {});
        const duplicates = serverNames.filter(name => existingServerNames.includes(name));
        
        if (duplicates.length > 0) {
          setNewServerError(`Server already exists: ${duplicates.join(', ')}`);
          return;
        }
      }
      
      const newConfig = {
        ...config,
        mcpServers: {
          ...config.mcpServers,
          ...serverConfig
        }
      };
      
      setConfig(newConfig);
      setAddServerDialog(false);
      setEditServerDialog(false);
      setEditingServer(null);
      setNewServerJson('');
      setNewServerValid(null);
      setNewServerError('');
      
      showNotification(`${editingServer ? 'Updated' : 'Added'} server: ${serverName}`, 'success');
      
      // Auto-save after adding/editing server
      await handleSave(newConfig);
    } catch (error) {
      setNewServerError('Failed to add servers: ' + error.message);
    }
  };

  const handleAddServerCancel = () => {
    setAddServerDialog(false);
    setEditServerDialog(false);
    setEditingServer(null);
    setNewServerJson('');
    setNewServerValid(null);
    setNewServerError('');
  };

  const handleServerEdit = (server) => {
    // Use raw config instead of transformed server object
    // This preserves ALL fields exactly as they are in mcp.json
    const serverName = server.name;
    const rawServerConfig = config.mcpServers[serverName];
    
    if (!rawServerConfig) {
      console.error('Server not found in config:', serverName);
      return;
    }
    
    // Build JSON with raw config (no transformations)
    const editConfig = {
      [serverName]: rawServerConfig
    };
    
    setEditingServer(server);
    setNewServerJson(JSON.stringify(editConfig, null, 2));
    setEditServerDialog(true);
  };

  const handleServerSelect = (serverName) => {
    setSelectedServer(serverName);
    // Auto-focus on the selected server in JSON editor
    setTimeout(() => {
      const jsonEditor = document.querySelector('.cm-editor');
      if (jsonEditor && config.mcpServers && config.mcpServers[serverName]) {
        // Find the server in the JSON and scroll to it
        const jsonString = JSON.stringify(config, null, 2);
        const serverIndex = jsonString.indexOf(`"${serverName}"`);
        if (serverIndex !== -1) {
          // Calculate approximate line number
          const beforeServer = jsonString.substring(0, serverIndex);
          const lineNumber = beforeServer.split('\n').length;
          
          // Scroll to the line (rough approximation)
          const lineHeight = 20; // Approximate line height
          const scrollTop = Math.max(0, (lineNumber - 5) * lineHeight);
          
          const scrollContainer = jsonEditor.querySelector('.cm-scroller');
          if (scrollContainer) {
            scrollContainer.scrollTop = scrollTop;
          }
        }
      }
    }, 100);
  };

  if (loading) {
    return <LoadingOverlay open={true} message="Loading MCP Configuration..." />;
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* 2-Panel Layout with Resizable Divider */}
      <Box 
        sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}
        data-resizable-container
      >
        {/* Left Panel - Server List */}
        <Box sx={{ width: `${leftPanelWidth}%`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Server List */}
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            <MCPServerList
              servers={servers}
              onServerToggle={handleServerToggle}
              onServerAdd={handleServerAdd}
              onServerRemove={handleServerRemove}
              onServerSelect={handleServerSelect}
              onServerEdit={handleServerEdit}
              selectedServer={selectedServer}
              serverTools={serverTools}
              loadingTools={loadingTools}
              disabledTools={disabledTools}
              onToolToggle={handleToolToggle}
            />
          </Box>
        </Box>

        {/* Resizable Divider */}
        <ResizableDivider onMouseDown={handleMouseDown} isDragging={isDragging} />


        {/* Right Panel - JSON Editor */}
        <Box sx={{ width: `${100 - leftPanelWidth}%`, overflow: 'hidden' }}>
          <CustomJSONEditor
            config={config}
            onConfigChange={handleConfigChange}
            onSave={handleSave}
            selectedServer={selectedServer}
            onServerAdd={handleServerAdd}
            configFilePath={getCurrentConfigPath()}
          />
        </Box>
      </Box>

      {/* Notifications */}
      <NotificationSnackbar 
        notification={notification} 
        onClose={hideNotification} 
      />

      {/* Add/Edit Server Dialog */}
      <AddServerDialog
        open={addServerDialog || editServerDialog}
        onClose={handleAddServerCancel}
        newServerJson={newServerJson}
        onJsonChange={handleNewServerJsonChange}
        newServerValid={newServerValid}
        newServerError={newServerError}
        onConvertToWSL={handleConvertToWSL}
        onSubmit={handleAddServerSubmit}
        isEditing={editServerDialog}
      />
    </Box>
  );
};

export default MCPWorkbench;
