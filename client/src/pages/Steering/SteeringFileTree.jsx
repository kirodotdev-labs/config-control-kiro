/**
 * @fileoverview File tree component for browsing and managing steering files.
 */
import React, { useState } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  CircularProgress,
  Alert,
  Button
} from '@mui/material';
import {
  Folder as FolderIcon,
  InsertDriveFile as FileIcon,
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  Add as AddIcon
} from '@mui/icons-material';
import api from '../../services/api';
import FileBrowserDialog from '../../components/common/FileBrowserDialog';
import { useFileExplorer, ContextMenu, ConflictDialog, ConfirmDialog, NameInputDialog } from '../../components/FileExplorer';

const SteeringFileTree = ({ title, basePath, onFileSelect, onSelectionChange, protectedFiles = [], showAddButton = false, selectedCount = 0, onAddToSteering, isAddingToSteering = false }) => {
  const [expandedFolders, setExpandedFolders] = useState({ root: true });
  const [contextMenu, setContextMenu] = useState(null);
  const [conflictDialog, setConflictDialog] = useState({ open: false, conflicts: [] });
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });
  const [nameInputDialog, setNameInputDialog] = useState({ open: false, title: '', label: '', type: 'file', onConfirm: null });
  const [folderContentsCache, setFolderContentsCache] = useState({});
  const [fileBrowserOpen, setFileBrowserOpen] = useState(false);
  const queryClient = useQueryClient();

  const handleConflictResolution = (conflicts) => {
    return new Promise((resolve) => {
      setConflictDialog({
        open: true,
        conflicts,
        onResolve: (resolution) => {
          setConflictDialog({ open: false, conflicts: [] });
          resolve(resolution);
        },
        onCancel: () => {
          setConflictDialog({ open: false, conflicts: [] });
          resolve('cancel');
        }
      });
    });
  };

  const fileExplorer = useFileExplorer({
    enabled: true,
    basePath: basePath,
    fileFilter: ['.md'],
    onRefresh: () => {
      queryClient.invalidateQueries(['steering-files', basePath]);
      setFolderContentsCache({}); // Clear folder cache
      refetch();
    }
  });

  // Notify parent of selection changes
  React.useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange(fileExplorer.selectedItems);
    }
  }, [fileExplorer.selectedItems, onSelectionChange]);

  const { data: filesData, isLoading, error, refetch } = useQuery(
    ['steering-files', basePath],
    async () => {
      const res = await api.get('/fileexplorer/browse', {
        params: { path: basePath, filter: '.md' }
      });
      return res.data;
    },
    {
      staleTime: 5 * 60 * 1000,
    }
  );

  const handleFolderToggle = async (path) => {
    const isCurrentlyExpanded = expandedFolders[path];
    
    setExpandedFolders(prev => ({
      ...prev,
      [path]: !prev[path]
    }));

    // Fetch contents if expanding and not cached
    if (!isCurrentlyExpanded && !folderContentsCache[path]) {
      try {
        const res = await api.get('/fileexplorer/browse', {
          params: { path: path, filter: '.md' }
        });
        setFolderContentsCache(prev => ({
          ...prev,
          [path]: res.data
        }));
      } catch (error) {
        console.error('Failed to fetch folder contents:', error);
      }
    }
  };

  const handleItemClick = (item, event) => {
    fileExplorer.handleSelect(item, event);
    if (!item.isDirectory && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      onFileSelect(item);
    }
  };

  const handleFileAdd = async (fileUri) => {
    try {
      // Extract path from file:// URI
      const sourcePath = fileUri.replace('file://', '');
      const fileName = sourcePath.split('/').pop();
      const destPath = `${basePath}/${fileName}`;
      
      // Check for conflicts
      const conflictRes = await api.post('/fileexplorer/check-conflicts', {
        sources: [sourcePath],
        dest: basePath
      });
      const conflictData = conflictRes.data;

      if (conflictData.conflicts && conflictData.conflicts.length > 0) {
        const resolution = await handleConflictResolution(conflictData.conflicts);
        if (resolution === 'cancel') return;
        
        // Copy with resolution
        await api.post(`/fileexplorer/bulk-copy?resolution=${resolution}`, {
          sources: [sourcePath],
          dest: basePath
        });
      } else {
        // No conflicts, just copy
        await api.post('/fileexplorer/bulk-copy', {
          sources: [sourcePath],
          dest: basePath
        });
      }
      
      setFolderContentsCache({});
      queryClient.invalidateQueries(['steering-files', basePath]);
      refetch();
      setFileBrowserOpen(false);
    } catch (error) {
      console.error('Failed to add file:', error);
    }
  };

  const handleContextMenu = (event, item) => {
    event.preventDefault();
    event.stopPropagation();
    
    fileExplorer.handleSelect(item, event);
    setContextMenu({
      mouseX: event.clientX,
      mouseY: event.clientY,
      item: item
    });
  };

  const renderFolder = (folder, level = 1) => {
    const folderPath = folder.path;
    const isExpanded = expandedFolders[folderPath];
    const folderItem = { name: folder.name, path: folder.path, isDirectory: true };
    const isSelected = fileExplorer.selectedItems.some(i => i.path === folderPath);

    const folderContents = folderContentsCache[folderPath] || {};
    const folderFiles = folderContents.files || [];
    const subfolders = folderContents.folders || [];

    return (
      <React.Fragment key={folderPath}>
        {/* Folder Header */}
        <ListItem disablePadding>
          <ListItemButton
            sx={{
              pl: 4 * level,
              bgcolor: isSelected ? 'action.selected' : 'transparent'
            }}
            onClick={(e) => {
              fileExplorer.handleSelect(folderItem, e);
              handleFolderToggle(folderPath);
            }}
            onContextMenu={(e) => handleContextMenu(e, folderItem)}
          >
            <ListItemIcon sx={{ minWidth: 32 }}>
              {isExpanded ? <ExpandMoreIcon /> : <ChevronRightIcon />}
            </ListItemIcon>
            <ListItemIcon sx={{ minWidth: 32 }}>
              <FolderIcon />
            </ListItemIcon>
            <ListItemText
              primary={folder.name}
              primaryTypographyProps={{ variant: 'body2' }}
            />
          </ListItemButton>
        </ListItem>

        {/* Folder Contents */}
        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
          <List component="div" disablePadding>
            {/* Files */}
            {folderFiles.map((file) => {
              const fileItem = {
                name: file.name,
                path: file.path,
                isDirectory: false
              };
              const isFileSelected = fileExplorer.selectedItems.some(i => i.path === file.path);
              const isProtected = protectedFiles.includes(file.name);

              return (
                <ListItem key={file.path} disablePadding>
                  <ListItemButton
                    sx={{
                      pl: 4 * (level + 1),
                      bgcolor: isFileSelected ? 'action.selected' : 'transparent'
                    }}
                    onClick={(e) => handleItemClick(fileItem, e)}
                    onContextMenu={(e) => handleContextMenu(e, fileItem)}
                  >
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <FileIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                      primary={file.name}
                      primaryTypographyProps={{ variant: 'body2' }}
                    />
                  </ListItemButton>
                </ListItem>
              );
            })}

            {/* Subfolders */}
            {subfolders.map((subfolder) => renderFolder(subfolder, level + 1))}
          </List>
        </Collapse>
      </React.Fragment>
    );
  };

  if (isLoading) {
    return (
      <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">Failed to load files</Alert>
      </Box>
    );
  }

  const rootFiles = filesData?.files || [];
  const folders = filesData?.folders || [];

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      {(title || showAddButton) && (
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          {title && <Typography variant="h6">{title}</Typography>}
          {showAddButton && (
            <Box sx={{ display: 'flex', gap: 1, mt: title ? 1 : 0 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<AddIcon />}
                onClick={() => setFileBrowserOpen(true)}
                sx={{ flex: 1 }}
              >
                Import File/Folder
              </Button>
              {onAddToSteering && (
                <Button
                  variant="outlined"
                  size="small"
                  disabled={selectedCount === 0 || isAddingToSteering}
                  onClick={onAddToSteering}
                  sx={{ flex: 1 }}
                >
                  {isAddingToSteering ? 'Adding...' : 'Add to Steering'}
                </Button>
              )}
            </Box>
          )}
        </Box>
      )}

      {/* File Tree */}
      <Box 
        sx={{ flex: 1, overflow: 'auto' }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          fileExplorer.clearSelection();
          setContextMenu({
            mouseX: e.clientX,
            mouseY: e.clientY,
            item: { name: 'root', path: basePath, isDirectory: true }
          });
        }}
      >
        <List dense>
          {/* Root Files */}
          {rootFiles.map((file) => {
            const fileItem = { name: file.name, path: file.path, isDirectory: false };
            const isSelected = fileExplorer.selectedItems.some(i => i.path === file.path);
            const isProtected = protectedFiles.includes(file.name);

            return (
              <ListItem key={file.path} disablePadding>
                <ListItemButton
                  sx={{
                    pl: 2,
                    bgcolor: isSelected ? 'action.selected' : 'transparent'
                  }}
                  onClick={(e) => handleItemClick(fileItem, e)}
                  onContextMenu={(e) => handleContextMenu(e, fileItem)}
                >
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <FileIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary={file.name}
                    primaryTypographyProps={{ variant: 'body2' }}
                  />
                </ListItemButton>
              </ListItem>
            );
          })}

          {/* Folders */}
          {folders.map((folder) => renderFolder(folder, 1))}
        </List>
      </Box>

      {/* Context Menu */}
      <ContextMenu
        anchorPosition={contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : null}
        onClose={() => setContextMenu(null)}
        fileExplorer={fileExplorer}
        onCut={() => {
          fileExplorer.handleCut();
          setContextMenu(null);
        }}
        onCopy={() => {
          fileExplorer.handleCopy();
          setContextMenu(null);
        }}
        onPaste={async () => {
          const targetFolder = contextMenu?.item?.isDirectory 
            ? contextMenu.item 
            : { path: basePath, isDirectory: true };
          await fileExplorer.handlePaste(targetFolder, handleConflictResolution);
          setFolderContentsCache({});
          refetch();
          setContextMenu(null);
        }}
        onDelete={() => {
          // Check if any selected items are protected
          const protectedItems = fileExplorer.selectedItems.filter(item => 
            protectedFiles.includes(item.name)
          );
          
          if (protectedItems.length > 0) {
            setConfirmDialog({
              open: true,
              title: 'Cannot Delete',
              message: `Cannot delete protected files: ${protectedItems.map(i => i.name).join(', ')}`,
              onConfirm: () => {
                setConfirmDialog({ open: false, title: '', message: '', onConfirm: null });
              }
            });
            setContextMenu(null);
            return;
          }
          
          setConfirmDialog({
            open: true,
            title: 'Delete',
            message: `Are you sure you want to delete ${fileExplorer.selectedItems.length} item(s)?`,
            onConfirm: async () => {
              const paths = fileExplorer.selectedItems.map(i => i.path);
              await api.post('/fileexplorer/bulk-delete', { paths });
              setFolderContentsCache({});
              refetch();
            }
          });
          setContextMenu(null);
        }}
        onRename={() => {
          const item = contextMenu?.item;
          if (!item) return;
          
          setNameInputDialog({
            open: true,
            title: 'Rename',
            label: 'New name',
            type: item.isDirectory ? 'folder' : 'file',
            onConfirm: async (newName) => {
              try {
                await fileExplorer.handleRename(item, newName);
                setFolderContentsCache({});
                refetch();
              } catch (error) {
                console.error('Rename failed:', error);
              }
            }
          });
          setContextMenu(null);
        }}
        onNewFile={() => {
          setNameInputDialog({
            open: true,
            title: 'New File',
            label: 'File name',
            type: 'file',
            onConfirm: async (name) => {
              const targetPath = contextMenu?.item?.isDirectory 
                ? contextMenu.item.path 
                : basePath;
              const newPath = `${targetPath}/${name}${name.endsWith('.md') ? '' : '.md'}`;
              await api.post('/fileexplorer/file', { path: newPath, content: '' });
              setFolderContentsCache({});
              refetch();
            }
          });
          setContextMenu(null);
        }}
        onNewFolder={() => {
          setNameInputDialog({
            open: true,
            title: 'New Folder',
            label: 'Folder name',
            type: 'folder',
            onConfirm: async (name) => {
              const targetPath = contextMenu?.item?.isDirectory 
                ? contextMenu.item.path 
                : basePath;
              const newPath = `${targetPath}/${name}`;
              await api.post('/fileexplorer/folder', { path: newPath });
              setFolderContentsCache({});
              refetch();
            }
          });
          setContextMenu(null);
        }}
        hasSelection={fileExplorer.selectedItems.length > 0}
        hasClipboard={fileExplorer.clipboard !== null}
        isFolder={contextMenu?.item?.isDirectory}
      />

      <ConflictDialog
        open={conflictDialog.open}
        conflicts={conflictDialog.conflicts}
        onResolve={conflictDialog.onResolve}
        onCancel={conflictDialog.onCancel}
      />

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={() => {
          confirmDialog.onConfirm?.();
          setConfirmDialog({ open: false, title: '', message: '', onConfirm: null });
        }}
        onCancel={() => setConfirmDialog({ open: false, title: '', message: '', onConfirm: null })}
      />

      <NameInputDialog
        open={nameInputDialog.open}
        title={nameInputDialog.title}
        label={nameInputDialog.label}
        type={nameInputDialog.type}
        onConfirm={(name) => {
          nameInputDialog.onConfirm?.(name);
          setNameInputDialog({ open: false, title: '', label: '', type: 'file', onConfirm: null });
        }}
        onCancel={() => setNameInputDialog({ open: false, title: '', label: '', type: 'file', onConfirm: null })}
      />

      <FileBrowserDialog
        open={fileBrowserOpen}
        onClose={() => setFileBrowserOpen(false)}
        onFileSelect={handleFileAdd}
        allowDirectorySelection={true}
        title={`Add File or Folder to ${title}`}
      />
    </Box>
  );
};

export default SteeringFileTree;
