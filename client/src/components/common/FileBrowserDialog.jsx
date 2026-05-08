/**
 * @fileoverview Dialog component for browsing and selecting files or directories.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth } from '../../services/api';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  Typography,
  Box,
  TextField,
  InputAdornment,
  Divider
} from '@mui/material';
import {
  Folder,
  InsertDriveFile,
  ArrowUpward,
  Home,
  Computer,
  FolderSpecial
} from '@mui/icons-material';

const FileBrowserDialog = ({ 
  open, 
  onClose, 
  onFileSelect, 
  accept = '', 
  allowDirectorySelection = true, 
  title = 'Select File or Directory' 
}) => {
  const [currentPath, setCurrentPath] = useState('');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [systemInfo, setSystemInfo] = useState(null);
  const [windowsMode, setWindowsMode] = useState(false);

  const acceptedExtensions = accept ? accept.split(',').map(ext => ext.trim().replace('.', '')) : [];

  const browseDirectory = useCallback(async (path = '') => {
    setLoading(true);
    setSelectedItem(null);
    try {
      const response = await fetchWithAuth(`/api/files/browse?path=${encodeURIComponent(path)}`);
      const data = await response.json();
      setCurrentPath(data.currentPath);
      setFiles(data.items || []);
      
      // Detect if we're in Windows territory (under /mnt/c)
      setWindowsMode(data.currentPath.startsWith('/mnt/c'));
    } catch (error) {
      console.error('Error browsing directory:', error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) {
      fetchWithAuth('/api/system/info')
        .then(res => res.json())
        .then(data => {
          setSystemInfo(data);
          browseDirectory();
        })
        .catch(() => {
          browseDirectory();
        });
    }
  }, [open, browseDirectory]);

  const handleWindowsHome = () => {
    if (systemInfo?.username) {
      browseDirectory(`/mnt/c/Users/${systemInfo.username}`);
    } else {
      browseDirectory('/mnt/c/Users');
    }
  };

  const handleLinuxHome = () => {
    browseDirectory(); // Default home directory
  };

  // Convert Linux path to Windows display format
  const getDisplayPath = (linuxPath) => {
    if (windowsMode && linuxPath.startsWith('/mnt/c')) {
      // Convert /mnt/c/Users/... to C:\Users\...
      return linuxPath.replace('/mnt/c', 'C:').replace(/\//g, '\\');
    }
    return linuxPath;
  };

  const handleItemClick = (item) => {
    // Single click: select the item (file or directory)
    if (item.type === 'directory' && allowDirectorySelection) {
      setSelectedItem(item);
    } else if (item.type === 'file') {
      const extension = item.name?.split('.').pop()?.toLowerCase() || '';
      if (acceptedExtensions.length === 0 || acceptedExtensions.includes(extension)) {
        setSelectedItem(item);
      }
    }
  };

  const handleItemDoubleClick = async (item) => {
    if (item.type === 'directory') {
      // Double click directory: navigate into it
      browseDirectory(item.path);
    } else {
      // Double click file: select it immediately
      const extension = item.name?.split('.').pop()?.toLowerCase() || '';
      if (acceptedExtensions.length === 0 || acceptedExtensions.includes(extension)) {
        await selectItem(item);
      }
    }
  };

  const selectItem = async (item) => {
    try {
      if (item.type === 'directory') {
        // For directories, return file:// URI directly
        const uri = `file://${item.path}`;
        if (uri && item.path) {
          onFileSelect(uri);
          onClose();
        } else {
          console.error('Invalid directory path:', item);
        }
      } else {
        // For files, generate URI via API
        const response = await fetchWithAuth('/api/files/generate-uri', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: item.path })
        });
        const data = await response.json();
        if (data.fileUri) {
          onFileSelect(data.fileUri);
          onClose();
        } else {
          console.error('No fileUri in response:', data);
        }
      }
    } catch (error) {
      console.error('Error selecting item:', error);
    }
  };

  const handleParentDirectory = () => {
    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
    browseDirectory(parentPath);
  };

  const handleOpen = () => {
    if (selectedItem) {
      selectItem(selectedItem);
    } else if (allowDirectorySelection && currentPath) {
      // Select current directory if nothing is selected
      onFileSelect(`file://${currentPath}`);
      onClose();
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: { height: '70vh', display: 'flex', flexDirection: 'column' }
      }}
    >
      <DialogTitle sx={{ pb: 1 }}>
        {title}
      </DialogTitle>
      
      <DialogContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 0 }}>
        {/* Address Bar */}
        <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
          <TextField
            fullWidth
            size="small"
            value={getDisplayPath(currentPath)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Computer fontSize="small" />
                </InputAdornment>
              ),
            }}
            sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.875rem' } }}
          />
        </Box>

        {/* Toolbar */}
        <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider', display: 'flex', gap: 1 }}>
          <Button
            size="small"
            startIcon={<ArrowUpward />}
            onClick={handleParentDirectory}
            disabled={currentPath === '/'}
          >
            Up
          </Button>
          <Button
            size="small"
            startIcon={<Home />}
            onClick={handleLinuxHome}
          >
            Home
          </Button>
          {systemInfo?.isWSL && (
            <Button
              size="small"
              startIcon={<FolderSpecial />}
              onClick={handleWindowsHome}
            >
              Windows Home
            </Button>
          )}
        </Box>

        {/* File List */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {loading && (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography>Loading...</Typography>
            </Box>
          )}
          
          {!loading && files.length === 0 && (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography color="text.secondary">No files found</Typography>
            </Box>
          )}
          
          {!loading && files.length > 0 && (
            <List dense sx={{ py: 0 }}>
              {files.map((item) => {
                const extension = item.name?.split('.').pop()?.toLowerCase() || '';
                const isAccepted = item.type === 'directory' || acceptedExtensions.length === 0 || acceptedExtensions.includes(extension);
                const isSelected = selectedItem?.path === item.path;
                
                return (
                  <ListItem 
                    key={item.path} 
                    disablePadding
                    sx={{ 
                      backgroundColor: isSelected ? 'action.selected' : 'transparent',
                      '&:hover': { backgroundColor: 'action.hover' }
                    }}
                  >
                    <ListItemButton 
                      onClick={() => handleItemClick(item)}
                      onDoubleClick={() => handleItemDoubleClick(item)}
                      disabled={!isAccepted}
                      sx={{ 
                        opacity: isAccepted ? 1 : 0.5,
                        py: 0.5
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        {item.type === 'directory' ? (
                          <Folder fontSize="small" />
                        ) : (
                          <InsertDriveFile fontSize="small" />
                        )}
                      </ListItemIcon>
                      <ListItemText 
                        primary={item.name}
                        primaryTypographyProps={{ fontSize: '0.875rem' }}
                      />
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          )}
        </Box>

        {/* File Name Input */}
        <Box sx={{ px: 2, py: 1, borderTop: 1, borderColor: 'divider' }}>
          <TextField
            fullWidth
            size="small"
            label="File name"
            value={selectedItem?.name || ''}
            InputProps={{ readOnly: true }}
          />
          <Typography variant="caption" color="text.secondary">
            Files in list: {files.length}
          </Typography>
        </Box>

        {loading && (
          <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
            <Typography variant="body2">Loading...</Typography>
          </Box>
        )}
      </DialogContent>
      
      <DialogActions sx={{ px: 2, py: 1 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleOpen} 
          variant="contained"
          disabled={!selectedItem && !(allowDirectorySelection && currentPath)}
        >
          {allowDirectorySelection && !selectedItem ? 'Select Directory' : 'Open'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FileBrowserDialog;
