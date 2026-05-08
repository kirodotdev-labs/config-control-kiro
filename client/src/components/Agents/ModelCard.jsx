/**
 * @fileoverview Card for selecting and configuring the agent's AI model.
 */
import React, { useState, useEffect } from 'react';
import { fetchWithAuth } from '../../services/api';
import {
  Card,
  CardContent,
  CardHeader,
  Box,
  IconButton,
  Collapse,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress
} from '@mui/material';
import {
  ExpandMore,
  ExpandLess,
  Psychology
} from '@mui/icons-material';

const ModelCard = ({ agent, onAgentChange, onHighlightJson, isActive }) => {
  const [expanded, setExpanded] = useState(false);
  const [availableModels, setAvailableModels] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchModels();
  }, []);

  const fetchModels = async () => {
    setLoading(true);
    try {
      const response = await fetchWithAuth('/api/system/models');
      if (response.ok) {
        const models = await response.json();
        setAvailableModels(models || []);
      } else {
        console.error('Failed to fetch models');
        setAvailableModels([]);
      }
    } catch (error) {
      console.error('Error fetching models:', error);
      setAvailableModels([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (field, value) => {
    const updatedAgent = { ...agent, [field]: value };
    onAgentChange(updatedAgent);
  };

  const handleCardClick = () => {
    onHighlightJson(['model']);
  };

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
        avatar={<Psychology color="primary" />}
        title="Model Configuration"
        subheader="AI model selection for this agent"
        action={
          <IconButton onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        }
      />
      
      <Collapse in={expanded}>
        <CardContent onClick={(e) => e.stopPropagation()}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            
            <FormControl>
              <InputLabel>Model</InputLabel>
              <Select
                value={agent.model || ''}
                onChange={(e) => handleFieldChange('model', e.target.value)}
                label="Model"
                disabled={loading}
              >
                <MenuItem value="">
                  <em>Default Model</em>
                </MenuItem>
                {loading ? (
                  <MenuItem disabled>
                    <CircularProgress size={20} />
                  </MenuItem>
                ) : (
                  availableModels.map((model) => (
                    <MenuItem key={model} value={model}>
                      {model}
                    </MenuItem>
                  ))
                )}
              </Select>
            </FormControl>
            
          </Box>
        </CardContent>
      </Collapse>
    </Card>
  );
};

export default ModelCard;
