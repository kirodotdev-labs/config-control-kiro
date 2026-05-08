/**
 * @fileoverview Card for editing agent basic info — name, description, and prompt.
 */
import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  TextField,
  Box,
  IconButton,
  Collapse,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction
} from '@mui/material';
import {
  ExpandMore,
  ExpandLess,
  Person,
  FolderOpen,
  Delete
} from '@mui/icons-material';
import UniversalPathBrowser from '../common/UniversalPathBrowser';

const BasicInfoCard = ({ agent, onAgentChange, onHighlightJson, isActive }) => {
  const [expanded, setExpanded] = useState(false);

  const handleFieldChange = (field, value) => {
    const updatedAgent = { ...agent, [field]: value };
    onAgentChange(updatedAgent);
  };

  const handleCardClick = () => {
    onHighlightJson(['name', 'description', 'prompt']);
  };

  const handleFileSelect = (fileUri) => {
    const currentPrompt = agent.prompt || '';
    
    // Combine existing text with file URI
    let newPrompt;
    if (currentPrompt && !currentPrompt.includes('file://')) {
      newPrompt = `${currentPrompt}\n\n${fileUri}`;
    } else if (currentPrompt.includes('file://')) {
      newPrompt = currentPrompt.replace(/file:\/\/[^\s\n]+/g, fileUri);
    } else {
      newPrompt = fileUri;
    }
    
    handleFieldChange('prompt', newPrompt.trim());
  };

  const handleRemoveFile = () => {
    const currentPrompt = agent.prompt || '';
    // Remove file URI and clean up extra newlines
    const newPrompt = currentPrompt.replace(/file:\/\/[^\s\n]+/g, '').replace(/\n\n+/g, '\n\n').trim();
    handleFieldChange('prompt', newPrompt);
  };

  // Extract file info from prompt
  const fileMatch = (agent.prompt || '').match(/file:\/\/([^\s\n]+)/);
  const attachedFile = fileMatch ? {
    uri: fileMatch[0],
    name: fileMatch[1].split(/[/\\]/).pop(),
    path: fileMatch[1]
  } : null;

  return (
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
        avatar={<Person color="primary" />}
        title="Basic Information"
        subheader="Agent identity and core settings"
        action={
          <IconButton onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        }
      />
      
      <Collapse in={expanded}>
        <CardContent onClick={(e) => e.stopPropagation()}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            
            <TextField
              label="Name"
              value={agent.name || ''}
              InputProps={{
                readOnly: true,
              }}
              helperText="Agent name (read-only - matches filename)"
              sx={{
                '& .MuiInputBase-input': {
                  color: 'text.secondary',
                  cursor: 'default'
                }
              }}
            />
            
            <TextField
              label="Description"
              value={agent.description || ''}
              onChange={(e) => handleFieldChange('description', e.target.value)}
              onFocus={() => onHighlightJson(['description'])}
              multiline
              rows={2}
              helperText="Brief description of the agent's purpose"
            />
            
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <TextField
                label="System Prompt"
                value={agent.prompt || ''}
                onChange={(e) => handleFieldChange('prompt', e.target.value)}
                onFocus={() => onHighlightJson(['prompt'])}
                multiline
                rows={3}
                helperText="System prompt text and/or file:// URI"
              />
              
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <UniversalPathBrowser
                  label="Browse File"
                  onSelect={handleFileSelect}
                  buttonProps={{
                    variant: "outlined",
                    size: "small"
                  }}
                />
              </Box>
              
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                Common types: .md, .txt, .json
              </Typography>
              
              {/* Attached File List */}
              {attachedFile && (
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Attached File
                  </Typography>
                  
                  <List dense>
                    <ListItem sx={{ px: 0 }}>
                      <ListItemText
                        primary={attachedFile.name}
                        secondary={attachedFile.uri}
                      />
                      <ListItemSecondaryAction>
                        <IconButton
                          edge="end"
                          onClick={handleRemoveFile}
                          size="small"
                          color="error"
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  </List>
                </Box>
              )}
            </Box>
            
          </Box>
        </CardContent>
      </Collapse>
    </Card>
  );
};

export default BasicInfoCard;
