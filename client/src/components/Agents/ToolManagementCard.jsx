/**
 * @fileoverview Card for managing agent tool permissions and configurations.
 */
import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  Box,
  IconButton,
  Collapse,
  Typography,
  Button
} from '@mui/material';
import {
  ExpandMore,
  ExpandLess,
  Build,
  Settings
} from '@mui/icons-material';
import ToolConfigurationDialog from './ToolConfigurationDialog';

const ToolManagementCard = ({ agent, onAgentChange, onHighlightJson, isActive }) => {
  const [expanded, setExpanded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleCardClick = () => {
    onHighlightJson(['tools', 'allowedTools', 'toolAliases', 'toolsSettings']);
  };

  // Count built-in tools used
  const builtInTools = [
    'read', 'write', 'glob', 'grep', 'shell', 'aws',
    'web_search', 'web_fetch', 'introspect', 'report_issue',
    'knowledge', 'thinking', 'todo', 'use_subagent'
  ];

  const tools = agent.tools || [];
  const hasAllTools = tools.includes('*');
  const builtInToolsUsed = hasAllTools ? builtInTools.length : 
    tools.filter(tool => builtInTools.includes(tool)).length;

  return (
    <>
      <Card 
        sx={{ 
          cursor: 'pointer',
          '&:hover': { 
            boxShadow: 2,
            borderColor: 'primary.light'
          },
          border: isActive ? 2 : 1,
          borderColor: isActive ? 'primary.main' : 'divider'
        }}
        onClick={handleCardClick}
      >
        <CardHeader
          avatar={<Build color="primary" />}
          title="Tool Management"
          subheader="Tools, permissions, aliases, and settings"
          action={
            <IconButton onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
              {expanded ? <ExpandLess /> : <ExpandMore />}
            </IconButton>
          }
        />
        
        <Collapse in={expanded}>
          <CardContent onClick={(e) => e.stopPropagation()}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {builtInToolsUsed} built-in tools configured
              </Typography>
              
              <Button
                variant="outlined"
                startIcon={<Settings />}
                onClick={() => setDialogOpen(true)}
                sx={{ alignSelf: 'flex-start' }}
              >
                Configure Tools
              </Button>
            </Box>
          </CardContent>
        </Collapse>
      </Card>

      <ToolConfigurationDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        agent={agent}
        onAgentChange={onAgentChange}
      />
    </>
  );
};

export default ToolManagementCard;
