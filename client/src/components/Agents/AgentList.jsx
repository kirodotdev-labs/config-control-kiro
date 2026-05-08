/**
 * @fileoverview Displays a list of agents with create, edit, delete, and duplicate actions.
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Button,
  Chip,
  Menu,
  MenuItem,
  Stack,
  Select,
  FormControl,
  InputLabel
} from '@mui/material';
import {
  Add,
  MoreVert,
  ContentCopy,
  Delete
} from '@mui/icons-material';

const AgentList = ({ 
  agents, 
  onAddAgent, 
  onAgentRemove,
  onSelectAgent, 
  selectedAgent,
  loading
}) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const [menuAgent, setMenuAgent] = useState(null);
  
  // Scroll position preservation
  const scrollContainerRef = useRef(null);

  const getAgentStatus = (agent) => {
    return agent.status || 'unknown';
  };

  const getToolCount = (agent) => {
    if (agent.tools && Array.isArray(agent.tools)) return agent.tools.length;
    if (agent.toolCount) return agent.toolCount;
    return 0;
  };

  const handleMenuOpen = (event, agent) => {
    setAnchorEl(event.currentTarget);
    setMenuAgent(agent);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setMenuAgent(null);
  };

  const handleCopyConfig = (agent) => {
    navigator.clipboard.writeText(JSON.stringify(agent, null, 2));
    handleMenuClose();
  };

  const handleDeleteAgent = (agent) => {
    onAgentRemove && onAgentRemove(agent.name);
    handleMenuClose();
  };

  const handleAgentSelect = (event) => {
    const agentName = event.target.value;
    const agent = agents.find(a => a.name === agentName);
    if (agent) {
      onSelectAgent(agent);
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header Controls */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        {/* Agent Selector */}
        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
          <InputLabel>Select Agent</InputLabel>
          <Select
            value={selectedAgent?.name || ''}
            onChange={handleAgentSelect}
            label="Select Agent"
          >
            {agents.map((agent) => (
              <MenuItem key={agent.name} value={agent.name}>
                {agent.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Action Buttons */}
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <Button
            variant="outlined"
            startIcon={<Add />}
            onClick={onAddAgent}
            size="small"
          >
            Add Agent
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<Delete />}
            onClick={() => selectedAgent && onAgentRemove && onAgentRemove(selectedAgent.name)}
            disabled={!selectedAgent}
            size="small"
          >
            Remove Agent
          </Button>
        </Stack>
      </Box>

      {/* Context Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => handleCopyConfig(menuAgent)}>
          <ContentCopy sx={{ mr: 1 }} fontSize="small" />
          Copy Configuration
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default AgentList;
