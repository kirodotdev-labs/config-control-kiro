/**
 * @fileoverview Agents Page - Complete agent management interface
 * @llm-purpose Main page for creating, editing, and managing Kiro agents
 * @dependencies useNotification, useApiMutation, AgentList, CustomJSONEditor
 * @patterns Standard page pattern: hooks + queries + mutations + UI + notifications
 * @features Agent CRUD, JSON editing, config cards, drag-resize panels
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Typography, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField } from '@mui/material';
import { useQuery, useQueryClient } from 'react-query';
import AgentList from '../../components/Agents/AgentList';
import AgentConfigCards from '../../components/Agents/AgentConfigCards';
import CustomJSONEditor from '../../components/Agents/CustomJSONEditor';
import NotificationSnackbar from '../../components/common/NotificationSnackbar';
import LoadingOverlay from '../../components/common/LoadingOverlay';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ResizableDivider from '../../components/common/ResizableDivider';
import { useNotification } from '../../hooks/useNotification';
import { orderAgentFields } from '../../components/Agents/agentUtils';
import { useApiMutation } from '../../hooks/useApiMutation';
import usePersistedState from '../../hooks/usePersistedState';
import useResizablePanels from '../../hooks/useResizablePanels';
import { agentService } from '../../services/api';
import { useWorkspace } from '../../contexts/WorkspaceContext';

const Agents = () => {
  const { configPath } = useWorkspace();
  const [config, setConfig] = useState({
    agents: {}
  });
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = usePersistedState('selectedAgent', null);
  useEffect(() => { setSelectedAgent(null); }, [configPath]);
  const { notification, showNotification, hideNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const { leftPanelWidth, isDragging, handleMouseDown } = useResizablePanels(40, 'agentsLeftPanelWidth', 20, 80);
  const [highlightedFields, setHighlightedFields] = useState([]);
  const [activeCard, setActiveCard] = useState(null);
  const [agentWorkingDirectory, setAgentWorkingDirectory] = useState('');
  const jsonEditorRef = useRef();
  
  const [addAgentDialog, setAddAgentDialog] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentError, setNewAgentError] = useState('');
  
  const [removeAgentDialog, setRemoveAgentDialog] = useState(false);
  const [agentToRemove, setAgentToRemove] = useState(null);
  
  const queryClient = useQueryClient();

  // Create agent mutation
  const createAgentMutation = useApiMutation(
    (agentData) => agentService.createAgent(agentData),
    {
      successMessage: (data) => `Agent "${data.name}" created successfully`,
      invalidateQueries: ['agents'],
      onSuccess: async (newAgent) => {
        // Wait for agents list to refresh
        await refetchAgents();
        
        // Now select the new agent
        setSelectedAgent(newAgent);
        setAddAgentDialog(false);
        setNewAgentName('');
        setNewAgentError('');
        // Refresh steering profiles list
        queryClient.invalidateQueries('steering-profiles');
      },
      onError: (error) => {
        const message = error.response?.data?.message || error.message || 'Failed to create agent';
        setNewAgentError(message);
      }
    }
  );

  // Delete agent mutation
  const deleteAgentMutation = useApiMutation(
    (agentName) => agentService.deleteAgent(agentName),
    {
      successMessage: (_, agentName) => `Agent "${agentName}" removed successfully`,
      invalidateQueries: ['agents'],
      onSuccess: (_, agentName) => {
        // Clear selected agent immediately to stop any pending requests
        if (selectedAgent?.name === agentName) {
          setSelectedAgent(null);
        }
        // Force refetch agents list
        refetchAgents();
        // Refresh steering profiles list
        queryClient.invalidateQueries('steering-profiles');
      }
    }
  );

  // Fetch agents data
  const { data: agentData = [], refetch: refetchAgents } = useQuery(
    ['agents'], 
    () => agentService.getAllAgents(),
    { 
      enabled: true,
      refetchOnWindowFocus: false,
      staleTime: 0
    }
  );

  // Load initial configuration
  useEffect(() => {
    loadAgentConfig();
  }, []);

  // Sync agents with data
  useEffect(() => {
    // Handle both array and object responses
    if (Array.isArray(agentData)) {
      setAgents(agentData);
    } else if (agentData && typeof agentData === 'object') {
      // Convert object to array if needed
      const agentArray = Object.keys(agentData).map(key => ({
        name: key,
        ...agentData[key]
      }));
      setAgents(agentArray);
    } else {
      setAgents([]);
    }
  }, [agentData]);

  const loadAgentConfig = async () => {
    try {
      setLoading(true);
      const response = await agentService.getConfig();
      const loadedConfig = response.data.data || { agents: {} };
      setConfig(loadedConfig);
    } catch (error) {
      console.error('Failed to load Agent config:', error);
      showNotification('Failed to load Agent configuration', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAgentSelect = (agent) => {
    // Apply field ordering when selecting an agent
    if (agent) {
      setSelectedAgent(orderAgentFields(agent));
    } else {
      setSelectedAgent(null);
    }
  };

  const handleAgentChange = (updatedAgent) => {
    setSelectedAgent(updatedAgent);
  };

  const handleHighlightJson = (fields) => {
    setHighlightedFields(fields);
    
    if (fields && fields.length > 0) {
      const firstField = fields[0].split('.')[0];
      setActiveCard(firstField);
    } else {
      setActiveCard(null);
    }
  };

  const handleValidationError = (error) => {
    if (error) {
      showNotification(error, 'error');
    }
  };

  const handleCreateAgent = () => {
    if (!newAgentName.trim()) {
      setNewAgentError('Agent name is required');
      return;
    }

    // Validate agent name (basic validation)
    if (!/^[a-zA-Z0-9-_]+$/.test(newAgentName.trim())) {
      setNewAgentError('Agent name can only contain letters, numbers, hyphens, and underscores');
      return;
    }

    // Create basic agent structure
    const agentData = {
      name: newAgentName.trim()
    };

    createAgentMutation.mutate(agentData);
  };

  const handleDeleteAgent = (agentName) => {
    setAgentToRemove(agentName);
    setRemoveAgentDialog(true);
  };

  const handleConfirmRemove = () => {
    if (agentToRemove) {
      deleteAgentMutation.mutate(agentToRemove);
    }
    setRemoveAgentDialog(false);
    setAgentToRemove(null);
  };

  const handleCancelRemove = () => {
    setRemoveAgentDialog(false);
    setAgentToRemove(null);
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Main Content */}
      <Box 
        sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}
        data-resizable-container
      >
        {/* Left Panel - Agent List + Config Cards */}
        <Box sx={{ width: `${leftPanelWidth}%`, borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Agent List */}
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <AgentList
              agents={agents}
              selectedAgent={selectedAgent}
              onSelectAgent={handleAgentSelect}
              onAddAgent={() => setAddAgentDialog(true)}
              onAgentRemove={handleDeleteAgent}
              onWorkingDirectoryChange={setAgentWorkingDirectory}
              loading={loading}
            />
          </Box>
          
          {/* Agent Config Cards */}
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            <AgentConfigCards
              agent={selectedAgent}
              onAgentChange={handleAgentChange}
              onHighlightJson={handleHighlightJson}
              onValidationError={handleValidationError}
              activeCard={activeCard}
            />
          </Box>
        </Box>

        {/* Resizer */}
        <ResizableDivider onMouseDown={handleMouseDown} isDragging={isDragging} />

        {/* Right Panel - JSON Editor */}
        <Box sx={{ width: `${100 - leftPanelWidth}%`, overflow: 'hidden' }}>
          {selectedAgent ? (
            <CustomJSONEditor
              ref={jsonEditorRef}
              agent={selectedAgent}
              config={config}
              onConfigChange={setConfig}
              onNotification={showNotification}
              highlightedFields={highlightedFields}
              onAgentChange={handleAgentChange}
              workingDirectory={agentWorkingDirectory}
            />
          ) : (
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography variant="h6" color="text.secondary">
                Select an agent to view and edit its configuration
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* Loading Overlay */}
      <LoadingOverlay 
        open={loading} 
        message="Loading agents..." 
      />

      {/* Notifications */}
      <NotificationSnackbar 
        notification={notification} 
        onClose={hideNotification} 
      />

      {/* Add Agent Dialog */}
      <Dialog open={addAgentDialog} onClose={() => setAddAgentDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add New Agent</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Enter a name for your new agent. You can configure all other settings after creation.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="Agent Name"
            value={newAgentName}
            onChange={(e) => {
              setNewAgentName(e.target.value);
              setNewAgentError('');
            }}
            error={!!newAgentError}
            helperText={newAgentError || 'Use letters, numbers, hyphens, and underscores only'}
            placeholder="my-custom-agent"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setAddAgentDialog(false);
            setNewAgentName('');
            setNewAgentError('');
          }}>
            Cancel
          </Button>
          <Button 
            variant="contained" 
            disabled={!newAgentName.trim() || createAgentMutation.isLoading}
            onClick={handleCreateAgent}
          >
            {createAgentMutation.isLoading ? 'Creating...' : 'Create Agent'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Remove Agent Confirmation Dialog */}
      <ConfirmDialog
        open={removeAgentDialog}
        onClose={handleCancelRemove}
        onConfirm={handleConfirmRemove}
        title="Remove Agent"
        message={
          <>
            Are you sure you want to remove agent <strong>"{agentToRemove}"</strong>?
            <br />
            <span style={{ color: 'orange' }}>
              This action cannot be undone. The agent file will be permanently deleted.
            </span>
          </>
        }
        confirmText="Remove Agent"
        confirmColor="error"
        loading={deleteAgentMutation.isLoading}
      />
    </Box>
  );
};

export default Agents;
