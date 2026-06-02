/**
 * @fileoverview Dialog component for browsing and selecting files or directories.
 * The address bar at the top accepts pasted paths in any common OS format
 * (Linux, macOS, Windows). When the user presses Enter, the path is
 * validated and the browser navigates to it — directories become the new
 * root, files navigate to their parent and pre-select the file.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { fetchWithAuth, resolvePath } from '../../services/api';
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
  InputAdornment,
} from '@mui/material';
import {
  Folder,
  InsertDriveFile,
  ArrowUpward,
  Home,
  Computer,
  FolderSpecial,
} from '@mui/icons-material';
import PathInput from './PathInput';

const FileBrowserDialog = ({
  open,
  onClose,
  onFileSelect,
  accept = '',
  allowDirectorySelection = true,
  title = 'Select File or Directory',
  initialPath = '',
}) => {
  const [currentPath, setCurrentPath] = useState('');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [systemInfo, setSystemInfo] = useState(null);
  const [windowsMode, setWindowsMode] = useState(false);
  const [addressBar, setAddressBar] = useState('');

  const acceptedExtensions = accept ? accept.split(',').map(ext => ext.trim().replace('.', '')) : [];

  const browseDirectory = useCallback(async (path = '', highlightName = '') => {
    setLoading(true);
    setSelectedItem(null);
    try {
      const response = await fetchWithAuth(`/api/files/browse?path=${encodeURIComponent(path)}`);
      const data = await response.json();
      setCurrentPath(data.currentPath);
      setFiles(data.items || []);
      setWindowsMode(data.currentPath.startsWith('/mnt/c'));
      // If we navigated to a parent because the user pasted a file path,
      // pre-select that file in the list.
      if (highlightName) {
        const match = (data.items || []).find(item => item.name === highlightName);
        if (match) setSelectedItem(match);
      }
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
          openInitial();
        })
        .catch(() => {
          openInitial();
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // openInitial decides where to land when the dialog first opens.
  // If a non-empty initialPath was provided, resolve it (handles
  // cross-OS formats and WSL translation) and navigate there. If the
  // path is a file, navigate to its parent and pre-select the file.
  // Falls back to home directory if the initial path is missing or
  // cannot be resolved.
  async function openInitial() {
    const seed = (initialPath || '').trim();
    if (!seed) {
      browseDirectory();
      return;
    }
    try {
      const result = await resolvePath(seed);
      if (result.valid) {
        if (result.type === 'directory') {
          browseDirectory(result.resolvedPath);
        } else {
          const fileName = result.resolvedPath.split('/').pop();
          browseDirectory(result.parentPath, fileName);
        }
      } else {
        browseDirectory();
      }
    } catch (err) {
      browseDirectory();
    }
  }

  // Keep the address bar text in sync with the current directory whenever
  // the browser navigates by clicking, but allow the user to overwrite it
  // freely when typing/pasting.
  useEffect(() => {
    setAddressBar(getDisplayPath(currentPath));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath, windowsMode]);

  const handleWindowsHome = () => {
    if (systemInfo?.username) {
      browseDirectory(`/mnt/c/Users/${systemInfo.username}`);
    } else {
      browseDirectory('/mnt/c/Users');
    }
  };

  const handleLinuxHome = () => {
    browseDirectory();
  };

  // Convert Linux mount path to Windows display when browsing /mnt/c.
  function getDisplayPath(linuxPath) {
    if (linuxPath && linuxPath.startsWith('/mnt/c')) {
      return linuxPath.replace('/mnt/c', 'C:').replace(/\//g, '\\');
    }
    return linuxPath || '';
  }

  // Resolve and navigate to whatever the user typed in the address bar.
  // Files navigate to the parent and pre-select the file; directories
  // become the new browse root. Validation (including the inline error
  // helper text) is handled by the PathInput component below.
  const handleAddressBarResolve = (result) => {
    if (!result.valid) return;
    if (result.type === 'directory') {
      browseDirectory(result.resolvedPath);
    } else {
      const fileName = result.resolvedPath.split('/').pop();
      browseDirectory(result.parentPath, fileName);
    }
  };

  const handleItemClick = (item) => {
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
      browseDirectory(item.path);
    } else {
      const extension = item.name?.split('.').pop()?.toLowerCase() || '';
      if (acceptedExtensions.length === 0 || acceptedExtensions.includes(extension)) {
        await selectItem(item);
      }
    }
  };

  const selectItem = async (item) => {
    try {
      if (item.type === 'directory') {
        const uri = `file://${item.path}`;
        if (uri && item.path) {
          onFileSelect(uri);
          onClose();
        }
      } else {
        const response = await fetchWithAuth('/api/files/generate-uri', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: item.path }),
        });
        const data = await response.json();
        if (data.fileUri) {
          onFileSelect(data.fileUri);
          onClose();
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

  // When the user clicks the bottom "Select Directory" / "Open" button.
  // If they have something selected in the list we use it directly. If
  // they have unsaved text in the address bar (different from the
  // current display path) we resolve it first and only accept the
  // selection when the path validates — invalid paths surface inline
  // via the PathInput error and this click becomes a no-op.
  const handleOpen = async () => {
    if (selectedItem) {
      selectItem(selectedItem);
      return;
    }
    const seed = (addressBar || '').trim();
    const isUnsavedInput = seed && seed !== getDisplayPath(currentPath);
    if (isUnsavedInput) {
      try {
        const result = await resolvePath(seed);
        if (!result.valid) return; // PathInput will already show the error
        if (result.type === 'directory') {
          onFileSelect(`file://${result.resolvedPath}`);
          onClose();
          return;
        }
        // It's a file. Honour it directly when files are valid choices,
        // otherwise fall back to the parent when only directories are
        // accepted.
        if (allowDirectorySelection) {
          onFileSelect(`file://${result.parentPath}`);
        } else {
          onFileSelect(`file://${result.resolvedPath}`);
        }
        onClose();
        return;
      } catch (err) {
        return;
      }
    }
    if (allowDirectorySelection && currentPath) {
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
      PaperProps={{ sx: { height: '70vh', display: 'flex', flexDirection: 'column' } }}
    >
      <DialogTitle sx={{ pb: 1 }}>{title}</DialogTitle>

      <DialogContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 0 }}>
        {/* Address Bar — editable. Type or paste any OS path; press Enter
            or click elsewhere (blur) to validate. Errors surface inline. */}
        <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
          <PathInput
            value={addressBar}
            onChange={setAddressBar}
            onResolve={handleAddressBarResolve}
            placeholder="Paste a path and press Enter (Linux, macOS, or Windows format)"
            helperText=" "
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
          <Button size="small" startIcon={<ArrowUpward />} onClick={handleParentDirectory} disabled={currentPath === '/'}>
            Up
          </Button>
          <Button size="small" startIcon={<Home />} onClick={handleLinuxHome}>
            Home
          </Button>
          {systemInfo?.isWSL && (
            <Button size="small" startIcon={<FolderSpecial />} onClick={handleWindowsHome}>
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
                      '&:hover': { backgroundColor: 'action.hover' },
                    }}
                  >
                    <ListItemButton
                      onClick={() => handleItemClick(item)}
                      onDoubleClick={() => handleItemDoubleClick(item)}
                      disabled={!isAccepted}
                      sx={{ opacity: isAccepted ? 1 : 0.5, py: 0.5 }}
                    >
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        {item.type === 'directory' ? <Folder fontSize="small" /> : <InsertDriveFile fontSize="small" />}
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

        {/* Footer status — keeps users oriented without a redundant filename field. */}
        <Box sx={{ px: 2, py: 1, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary">
            {selectedItem ? `Selected: ${selectedItem.name}` : `${files.length} item${files.length === 1 ? '' : 's'}`}
          </Typography>
        </Box>
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
