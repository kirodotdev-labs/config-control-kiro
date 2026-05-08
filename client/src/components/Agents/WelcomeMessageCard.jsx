/**
 * @fileoverview Card for editing the agent's welcome message shown on startup.
 */
import React, { useState } from 'react';
import {
  Card, CardContent, CardHeader, Box, IconButton, Collapse, TextField
} from '@mui/material';
import { ExpandMore, ExpandLess, Chat } from '@mui/icons-material';

const WelcomeMessageCard = ({ agent, onAgentChange, onHighlightJson, isActive }) => {
  const [expanded, setExpanded] = useState(false);

  const handleCardClick = () => onHighlightJson(['welcomeMessage']);

  const handleChange = (e) => {
    onAgentChange({ ...agent, welcomeMessage: e.target.value || undefined });
  };

  return (
    <Card
      sx={{
        cursor: 'pointer',
        '&:hover': { boxShadow: 2, borderColor: 'primary.light' },
        border: isActive ? 2 : 1,
        borderColor: isActive ? 'primary.main' : 'divider'
      }}
      onClick={handleCardClick}
    >
      <CardHeader
        avatar={<Chat color="primary" />}
        title="Welcome Message"
        subheader="Message displayed when switching to this agent"
        action={
          <IconButton onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        }
      />
      <Collapse in={expanded}>
        <CardContent onClick={(e) => e.stopPropagation()}>
          <TextField
            fullWidth
            multiline
            minRows={2}
            maxRows={4}
            label="Welcome Message"
            value={agent.welcomeMessage || ''}
            onChange={handleChange}
            placeholder="What would you like to build today?"
            helperText="Shown after switching to this agent"
          />
        </CardContent>
      </Collapse>
    </Card>
  );
};

export default WelcomeMessageCard;
