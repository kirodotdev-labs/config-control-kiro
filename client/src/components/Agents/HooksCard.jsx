/**
 * @fileoverview Card for configuring agent lifecycle hooks.
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
  Link,
  Settings
} from '@mui/icons-material';
import HookConfigurationDialog from './HookConfigurationDialog';

const HooksCard = ({ agent, onAgentChange, onHighlightJson, isActive }) => {
  const [expanded, setExpanded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleCardClick = () => {
    onHighlightJson(['hooks']);
  };

  const hooks = agent.hooks || {};
  const totalHooks = Object.values(hooks).reduce((sum, hookArray) => sum + hookArray.length, 0);

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
          avatar={<Link color="primary" />}
          title="Hooks"
          subheader={`Lifecycle commands (${totalHooks} configured)`}
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
                {Object.keys(hooks).length} hook types configured
              </Typography>
              
              <Button
                variant="outlined"
                startIcon={<Settings />}
                onClick={() => setDialogOpen(true)}
                sx={{ alignSelf: 'flex-start' }}
              >
                Configure Hooks
              </Button>
            </Box>
          </CardContent>
        </Collapse>
      </Card>

      <HookConfigurationDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        agent={agent}
        onAgentChange={onAgentChange}
      />
    </>
  );
};

export default HooksCard;
