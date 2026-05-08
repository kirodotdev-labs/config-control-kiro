/**
 * @fileoverview Right-click context menu for file explorer operations.
 */
import React from 'react';
import { Menu, MenuItem, ListItemIcon, ListItemText, Divider } from '@mui/material';
import {
  ContentCut as CutIcon,
  ContentCopy as CopyIcon,
  ContentPaste as PasteIcon,
  Delete as DeleteIcon,
  DriveFileRenameOutline as RenameIcon,
  CreateNewFolder as NewFolderIcon,
  NoteAdd as NewFileIcon
} from '@mui/icons-material';

const ContextMenu = ({ 
  anchorPosition, 
  onClose, 
  onCut, 
  onCopy, 
  onPaste, 
  onDelete, 
  onRename,
  onNewFolder,
  onNewFile,
  hasSelection,
  hasClipboard,
  isFolder
}) => {
  return (
    <Menu
      open={Boolean(anchorPosition)}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={anchorPosition}
    >
      {hasSelection && (
        <>
          <MenuItem onClick={onCut}>
            <ListItemIcon><CutIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Cut</ListItemText>
          </MenuItem>
          <MenuItem onClick={onCopy}>
            <ListItemIcon><CopyIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Copy</ListItemText>
          </MenuItem>
        </>
      )}
      
      {hasClipboard && isFolder && (
        <MenuItem onClick={onPaste}>
          <ListItemIcon><PasteIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Paste</ListItemText>
        </MenuItem>
      )}
      
      {hasSelection && (
        <>
          <MenuItem onClick={onRename}>
            <ListItemIcon><RenameIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Rename</ListItemText>
          </MenuItem>
          <Divider />
          <MenuItem onClick={onDelete}>
            <ListItemIcon><DeleteIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Delete</ListItemText>
          </MenuItem>
        </>
      )}
      
      {isFolder && (
        <>
          {hasSelection && <Divider />}
          <MenuItem onClick={onNewFolder}>
            <ListItemIcon><NewFolderIcon fontSize="small" /></ListItemIcon>
            <ListItemText>New Folder</ListItemText>
          </MenuItem>
          <MenuItem onClick={onNewFile}>
            <ListItemIcon><NewFileIcon fontSize="small" /></ListItemIcon>
            <ListItemText>New File</ListItemText>
          </MenuItem>
        </>
      )}
    </Menu>
  );
};

export default ContextMenu;
