/**
 * @fileoverview Confirmation dialog for destructive file explorer actions like delete and cut.
 */
import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Button,
  Box
} from '@mui/material';
import { 
  Delete as DeleteIcon,
  ContentCut as CutIcon,
  Warning as WarningIcon 
} from '@mui/icons-material';

const ConfirmDialog = ({ open, title, message, type = 'warning', onConfirm, onCancel }) => {
  const getIcon = () => {
    switch (type) {
      case 'delete':
        return <DeleteIcon color="error" />;
      case 'cut':
        return <CutIcon color="warning" />;
      default:
        return <WarningIcon color="warning" />;
    }
  };

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {getIcon()}
          <span>{title}</span>
        </Box>
      </DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button 
          onClick={onConfirm} 
          variant="contained" 
          color={type === 'delete' ? 'error' : 'primary'}
        >
          Confirm
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConfirmDialog;
