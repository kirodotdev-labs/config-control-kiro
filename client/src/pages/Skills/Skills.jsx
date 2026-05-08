/**
 * @fileoverview Skills page for viewing and editing skill definition files.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, TextField, CircularProgress, Card, CardContent, Button, Chip, Stack } from '@mui/material';
import { Save } from '@mui/icons-material';
import { useQueryClient } from 'react-query';
import api from '../../services/api';
import ResizableDivider from '../../components/common/ResizableDivider';
import useResizablePanels from '../../hooks/useResizablePanels';
import useSaveGuard from '../../hooks/useSaveGuard';
import SkillsFileTree from './SkillsFileTree';
import { useWorkspace } from '../../contexts/WorkspaceContext';

const Skills = () => {
  const { configPath } = useWorkspace();
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const { leftPanelWidth, isDragging, handleMouseDown } = useResizablePanels(33, 'skillsLeftPanelWidth', 20, 60, 'vertical');

  const isDirty = fileContent !== originalContent;

  const saveFile = useCallback(async () => {
    await api.post('/fileexplorer/file', { path: selectedFile.path, content: fileContent });
    setOriginalContent(fileContent);
    queryClient.invalidateQueries(['skills-files']);
  }, [selectedFile, fileContent, queryClient]);

  const { isSaving, handleSave } = useSaveGuard({ isDirty, onSave: saveFile });

  useEffect(() => {
    if (!selectedFile) return;
    const loadFile = async () => {
      setIsLoadingContent(true);
      try {
        const res = await api.get('/fileexplorer/read', { params: { path: selectedFile.path } });
        const content = res.data?.content || '';
        setFileContent(content);
        setOriginalContent(content);
      } catch (error) {
        setFileContent('');
        setOriginalContent('');
      } finally {
        setIsLoadingContent(false);
      }
    };
    loadFile();
  }, [selectedFile]);

  const handleFileSelect = (file) => {
    if (Array.isArray(file)) {
      setSelectedFile(file.length === 1 ? file[0] : null);
      if (file.length !== 1) { setFileContent(''); setOriginalContent(''); }
    } else {
      setSelectedFile(file);
    }
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }} data-resizable-container>
        <Box sx={{ width: `${leftPanelWidth}%`, borderRight: 1, borderColor: 'divider', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', flexShrink: 0 }}>
            <Typography variant="h6">Skills</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
              {configPath}/skills/
            </Typography>
          </Box>
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            <SkillsFileTree
              title=""
              basePath={`${configPath}/skills`}
              onFileSelect={handleFileSelect}
              onSelectionChange={() => {}}
              showAddButton={false}
            />
          </Box>
        </Box>

        <ResizableDivider onMouseDown={handleMouseDown} isDragging={isDragging} orientation="vertical" />

        <Box sx={{ width: `${100 - leftPanelWidth}%`, overflow: 'auto', p: 2 }}>
          {selectedFile ? (
            isLoadingContent ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
            ) : (
              <Card>
                <CardContent>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                    <Typography variant="h6">{selectedFile.name}</Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                      {isDirty && !isSaving && <Chip label="Unsaved" color="warning" size="small" variant="outlined" />}
                      {isSaving && <Chip label="Saving..." color="info" size="small" />}
                      <Button
                        variant="contained"
                        startIcon={<Save />}
                        onClick={handleSave}
                        disabled={!isDirty || isSaving}
                        size="small"
                      >
                        Save
                      </Button>
                    </Stack>
                  </Stack>
                  <TextField
                    fullWidth multiline rows={20}
                    value={fileContent}
                    onChange={(e) => setFileContent(e.target.value)}
                    placeholder="Enter markdown content..."
                    sx={{ fontFamily: 'monospace' }}
                  />
                </CardContent>
              </Card>
            )
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'text.secondary' }}>
              <Typography variant="h6">Select a file to edit</Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default Skills;
