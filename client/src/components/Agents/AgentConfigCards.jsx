/**
 * @fileoverview Renders the collection of configuration cards for editing an agent.
 */
import React from 'react';
import { Box, Typography } from '@mui/material';
import BasicInfoCard from './BasicInfoCard';
import ToolManagementCard from './ToolManagementCard';
import McpServersCard from './McpServersCard';
import ResourcesCard from './ResourcesCard';
import HooksCard from './HooksCard';
import ModelCard from './ModelCard';
import WelcomeMessageCard from './WelcomeMessageCard';
import KeyboardShortcutCard from './KeyboardShortcutCard';
import { orderAgentFields } from './agentUtils';

const AgentConfigCards = ({ 
  agent, 
  onAgentChange, 
  onHighlightJson,
  onValidationError,
  activeCard
}) => {
  // Wrapper to maintain field ordering for all agent changes
  const handleAgentChange = (updatedAgent) => {
    onAgentChange(orderAgentFields(updatedAgent));
  };
  if (!agent) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography color="text.secondary">
          Select an agent to configure
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="h6" gutterBottom>
        Agent Configuration
      </Typography>
      
      {/* Basic Information - name, description, prompt */}
      <BasicInfoCard
        agent={agent}
        onAgentChange={handleAgentChange}
        onHighlightJson={onHighlightJson}
        isActive={activeCard === 'name' || activeCard === 'description' || activeCard === 'prompt'}
      />
      
      {/* MCP Servers - mcpServers */}
      <McpServersCard
        agent={agent}
        onAgentChange={onAgentChange}
        onHighlightJson={onHighlightJson}
        isActive={activeCard === 'mcpServers'}
      />
      
      {/* Tool Management - tools, allowedTools, toolAliases, toolsSettings */}
      <ToolManagementCard
        agent={agent}
        onAgentChange={handleAgentChange}
        onHighlightJson={onHighlightJson}
        onValidationError={onValidationError}
        isActive={activeCard === 'tools' || activeCard === 'allowedTools' || activeCard === 'toolAliases' || activeCard === 'toolsSettings'}
      />
      
      {/* Resources - file:// URIs */}
      <ResourcesCard
        agent={agent}
        onAgentChange={handleAgentChange}
        onHighlightJson={onHighlightJson}
        isActive={activeCard === 'resources'}
      />
      
      {/* Hooks - lifecycle commands */}
      <HooksCard
        agent={agent}
        onAgentChange={handleAgentChange}
        onHighlightJson={onHighlightJson}
        isActive={activeCard === 'hooks'}
      />
      
      {/* Model Configuration - model */}
      <ModelCard
        agent={agent}
        onAgentChange={handleAgentChange}
        onHighlightJson={onHighlightJson}
        isActive={activeCard === 'model'}
      />
      
      {/* Welcome Message */}
      <WelcomeMessageCard
        agent={agent}
        onAgentChange={handleAgentChange}
        onHighlightJson={onHighlightJson}
        isActive={activeCard === 'welcomeMessage'}
      />
      
      {/* Keyboard Shortcut */}
      <KeyboardShortcutCard
        agent={agent}
        onAgentChange={handleAgentChange}
        onHighlightJson={onHighlightJson}
        isActive={activeCard === 'keyboardShortcut'}
      />
    </Box>
  );
};

export default AgentConfigCards;
