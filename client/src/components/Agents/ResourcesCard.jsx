/**
 * @fileoverview Card for managing agent resource file references with dropdown pickers.
 */
import React, { useState, useEffect } from 'react';
import {
  Card, CardContent, CardHeader, Box, IconButton, Collapse, Typography, Alert,
  List, ListItem, ListItemText, ListItemSecondaryAction, Button, Divider,
  FormControl, Select, MenuItem, CircularProgress
} from '@mui/material';
import {
  ExpandMore, ExpandLess, Folder, Delete, Add
} from '@mui/icons-material';
import UniversalPathBrowser from '../common/UniversalPathBrowser';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import api from '../../services/api';

const ResourcesCard = ({ agent, onAgentChange, onHighlightJson, isActive }) => {
  const [expanded, setExpanded] = useState(false);
  const { mode, activeWorkspace } = useWorkspace();
  const [steeringFiles, setSteeringFiles] = useState([]);
  const [skillFolders, setSkillFolders] = useState([]);
  const [loadingSteering, setLoadingSteering] = useState(false);
  const [loadingSkills, setLoadingSkills] = useState(false);
  const [steeringValue, setSteeringValue] = useState('');
  const [skillsValue, setSkillsValue] = useState('');

  const STEERING_GLOB = mode === 'workspace'
    ? 'file://.kiro/steering/**/*.md'
    : 'file://~/.kiro/steering/**/*.md';
  const SKILLS_GLOB = mode === 'workspace'
    ? 'skill://.kiro/skills/*/SKILL.md'
    : 'skill://~/.kiro/skills/*/SKILL.md';
  const steeringPrefix = mode === 'workspace'
    ? 'file://.kiro/steering/'
    : 'file://~/.kiro/steering/';
  const skillPrefix = mode === 'workspace'
    ? 'skill://.kiro/skills/'
    : 'skill://~/.kiro/skills/';

  const resources = (agent.resources || []).filter(r => r);

  const handleResourcesChange = (newResources) => {
    onAgentChange({ ...agent, resources: newResources });
  };

  // Load steering files when expanded
  useEffect(() => {
    if (expanded && steeringFiles.length === 0) loadSteeringFiles();
    if (expanded && skillFolders.length === 0) loadSkillFolders();
  }, [expanded]);

  const loadSteeringFiles = async () => {
    setLoadingSteering(true);
    try {
      const res = await api.get('/steering/files');
      setSteeringFiles(res.data.files || []);
    } catch (err) {
      console.error('Failed to load steering files:', err);
    }
    setLoadingSteering(false);
  };

  const loadSkillFolders = async () => {
    setLoadingSkills(true);
    try {
      const configPath = mode === 'workspace' && activeWorkspace ? activeWorkspace : '~';
      const skillsPath = `${configPath}/.kiro/skills`;
      const res = await api.get('/fileexplorer/browse', { params: { path: skillsPath } });
      setSkillFolders((res.data?.folders || []).map(f => f.name));
    } catch (err) {
      console.error('Failed to load skill folders:', err);
      setSkillFolders([]);
    }
    setLoadingSkills(false);
  };

  // Add steering resource from dropdown
  const handleSteeringAdd = (event) => {
    const value = event.target.value;
    if (!value) return;
    setSteeringValue('');
    if (resources.includes(value)) return;
    handleResourcesChange([...resources, value]);
  };

  // Add skill resource from dropdown
  const handleSkillsAdd = (event) => {
    const value = event.target.value;
    if (!value) return;
    setSkillsValue('');
    if (resources.includes(value)) return;
    handleResourcesChange([...resources, value]);
  };

  const handleFileSelect = (fileUri) => {
    if (!resources.includes(fileUri)) {
      handleResourcesChange([...resources, fileUri]);
    }
  };

  const removeResource = (resourceToRemove) => {
    handleResourcesChange(resources.filter(r => r !== resourceToRemove));
  };

  // Categorize resources for display
  const steeringResources = resources.filter(r => r === STEERING_GLOB || r.startsWith(steeringPrefix));
  const skillResources = resources.filter(r => r === SKILLS_GLOB || r.startsWith(skillPrefix));
  const otherResources = resources.filter(r =>
    r !== STEERING_GLOB && !r.startsWith(steeringPrefix) &&
    r !== SKILLS_GLOB && !r.startsWith(skillPrefix)
  );

  const getDisplayName = (resource) => {
    if (resource === STEERING_GLOB) return 'All Steering Files';
    if (resource === SKILLS_GLOB) return 'All Skills';
    if (resource.startsWith(steeringPrefix)) return resource.slice(steeringPrefix.length);
    if (resource.startsWith(skillPrefix)) return resource.slice(skillPrefix.length).replace('/SKILL.md', '');
    return resource;
  };

  return (
    <Card
      sx={{
        cursor: 'pointer',
        '&:hover': { boxShadow: 2, borderColor: 'primary.light' },
        border: isActive ? 2 : 1,
        borderColor: isActive ? 'primary.main' : 'divider'
      }}
      onClick={() => onHighlightJson(['resources'])}
    >
      <CardHeader
        avatar={<Folder color="primary" />}
        title="Resources"
        subheader={`File resources available to agent (${resources.length} configured)`}
        action={
          <IconButton onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>
        }
      />

      <Collapse in={expanded}>
        <CardContent onClick={(e) => e.stopPropagation()}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

            {/* Steering Dropdown */}
            <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 1, border: 1, borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="subtitle2">Steering Files</Typography>
              </Box>
              <FormControl fullWidth size="small">
                <Select
                  value={steeringValue}
                  onChange={handleSteeringAdd}
                  displayEmpty
                  renderValue={() => <Typography variant="body2" color="text.secondary">Add steering resource...</Typography>}
                >
                  <MenuItem value={STEERING_GLOB}>
                    <strong>All Files</strong>&nbsp;— {STEERING_GLOB}
                  </MenuItem>
                  <Divider />
                  {loadingSteering ? (
                    <MenuItem disabled><CircularProgress size={16} sx={{ mr: 1 }} /> Loading...</MenuItem>
                  ) : steeringFiles.length === 0 ? (
                    <MenuItem disabled>No steering files found</MenuItem>
                  ) : steeringFiles.map(file => (
                    <MenuItem key={file} value={`${steeringPrefix}${file}`} disabled={resources.includes(`${steeringPrefix}${file}`)}>
                      {file}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {steeringResources.length > 0 && (
                <List dense sx={{ mt: 1 }}>
                  {steeringResources.map((resource, i) => (
                    <ListItem key={i} sx={{ px: 0, py: 0.25 }}>
                      <ListItemText primary={getDisplayName(resource)} primaryTypographyProps={{ variant: 'body2' }} secondary={resource} secondaryTypographyProps={{ variant: 'caption', sx: { wordBreak: 'break-all' } }} />
                      <ListItemSecondaryAction>
                        <IconButton edge="end" onClick={() => removeResource(resource)} size="small" color="error">
                          <Delete fontSize="small" />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              )}
            </Box>

            {/* Skills Dropdown */}
            <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 1, border: 1, borderColor: 'divider' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="subtitle2">Skills</Typography>
              </Box>
              <FormControl fullWidth size="small">
                <Select
                  value={skillsValue}
                  onChange={handleSkillsAdd}
                  displayEmpty
                  renderValue={() => <Typography variant="body2" color="text.secondary">Add skill resource...</Typography>}
                >
                  <MenuItem value={SKILLS_GLOB}>
                    <strong>All Skills</strong>&nbsp;— {SKILLS_GLOB}
                  </MenuItem>
                  <Divider />
                  {loadingSkills ? (
                    <MenuItem disabled><CircularProgress size={16} sx={{ mr: 1 }} /> Loading...</MenuItem>
                  ) : skillFolders.length === 0 ? (
                    <MenuItem disabled>No skill folders found</MenuItem>
                  ) : skillFolders.map(folder => (
                    <MenuItem key={folder} value={`${skillPrefix}${folder}/SKILL.md`} disabled={resources.includes(`${skillPrefix}${folder}/SKILL.md`)}>
                      {folder}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {skillResources.length > 0 && (
                <List dense sx={{ mt: 1 }}>
                  {skillResources.map((resource, i) => (
                    <ListItem key={i} sx={{ px: 0, py: 0.25 }}>
                      <ListItemText primary={getDisplayName(resource)} primaryTypographyProps={{ variant: 'body2' }} secondary={resource} secondaryTypographyProps={{ variant: 'caption', sx: { wordBreak: 'break-all' } }} />
                      <ListItemSecondaryAction>
                        <IconButton edge="end" onClick={() => removeResource(resource)} size="small" color="error">
                          <Delete fontSize="small" />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              )}
            </Box>

            <Divider />

            {/* Other Resources */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Other File Resources</Typography>
              <UniversalPathBrowser label="Browse File" onSelect={handleFileSelect} buttonProps={{ variant: "outlined" }} />
            </Box>

            {otherResources.length > 0 && (
              <List dense>
                {otherResources.map((resource, index) => (
                  <ListItem key={index} sx={{ px: 0 }}>
                    <ListItemText primary={resource} secondary={resource.includes('*') ? 'Pattern' : 'Specific file'} />
                    <ListItemSecondaryAction>
                      <IconButton edge="end" onClick={() => removeResource(resource)} size="small" color="error">
                        <Delete fontSize="small" />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
            )}
          </Box>
        </CardContent>
      </Collapse>
    </Card>
  );
};

export default ResourcesCard;
