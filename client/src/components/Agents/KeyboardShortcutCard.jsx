/**
 * @fileoverview Card for configuring the agent's keyboard shortcut binding.
 */
import React, { useState } from 'react';
import {
  Card, CardContent, CardHeader, Box, IconButton, Collapse,
  FormControl, InputLabel, Select, MenuItem, Typography
} from '@mui/material';
import { ExpandMore, ExpandLess, Keyboard } from '@mui/icons-material';

const modifiers = ['ctrl', 'shift'];
const keys = [
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
  ...'0123456789'.split('')
];

const KeyboardShortcutCard = ({ agent, onAgentChange, onHighlightJson, isActive }) => {
  const [expanded, setExpanded] = useState(false);

  const handleCardClick = () => onHighlightJson(['keyboardShortcut']);

  // Parse current shortcut
  const current = agent.keyboardShortcut || '';
  const parts = current.split('+');
  const currentModifier = parts.length === 2 ? parts[0] : '';
  const currentKey = parts.length === 2 ? parts[1] : parts[0] || '';

  const updateShortcut = (modifier, key) => {
    if (!key) {
      onAgentChange({ ...agent, keyboardShortcut: undefined });
    } else if (modifier) {
      onAgentChange({ ...agent, keyboardShortcut: `${modifier}+${key}` });
    } else {
      onAgentChange({ ...agent, keyboardShortcut: key });
    }
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
        avatar={<Keyboard color="primary" />}
        title="Keyboard Shortcut"
        subheader={current ? `Current: ${current}` : 'No shortcut configured'}
        action={
          <IconButton onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        }
      />
      <Collapse in={expanded}>
        <CardContent onClick={(e) => e.stopPropagation()}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Modifier</InputLabel>
              <Select
                value={currentModifier}
                label="Modifier"
                onChange={(e) => updateShortcut(e.target.value, currentKey)}
              >
                <MenuItem value="">None</MenuItem>
                {modifiers.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
              </Select>
            </FormControl>
            <Typography variant="body1">+</Typography>
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel>Key</InputLabel>
              <Select
                value={currentKey}
                label="Key"
                onChange={(e) => updateShortcut(currentModifier, e.target.value)}
              >
                <MenuItem value="">None</MenuItem>
                {keys.map(k => <MenuItem key={k} value={k}>{k}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Press shortcut to switch to this agent. Press again to switch back.
          </Typography>
        </CardContent>
      </Collapse>
    </Card>
  );
};

export default KeyboardShortcutCard;
