/**
 * @fileoverview Dialog for entering a name when creating or renaming files and folders.
 */
import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box
} from '@mui/material';
import { CreateNewFolder as FolderIcon, NoteAdd as FileIcon } from '@mui/icons-material';

const NameInputDialog = ({ open, title, label, defaultValue = '', type = 'folder', onConfirm, onCancel }) => {
  const [name, setName] = useState(defaultValue);
  const [error, setError] = useState('');

  const handleConfirm = () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    onConfirm(name.trim());
    setName('');
    setError('');
  };

  const handleCancel = () => {
    onCancel();
    setName('');
    setError('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleConfirm();
    }
  };

  return (
    <Dialog open={open} onClose={handleCancel} maxWidth="xs" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {type === 'folder' ? <FolderIcon color="primary" /> : <FileIcon color="primary" />}
          <span>{title}</span>
        </Box>
      </DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          label={label}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError('');
          }}
          onKeyPress={handleKeyPress}
          error={!!error}
          helperText={error || (type === 'file' ? 'Extension .md will be added automatically' : '')}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel}>Cancel</Button>
        <Button onClick={handleConfirm} variant="contained">
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default NameInputDialog;
