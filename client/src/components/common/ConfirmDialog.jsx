/**
 * @fileoverview Confirm Dialog Component - Standardized confirmation dialogs
 * @llm-purpose Reusable confirmation dialog for destructive actions
 * @dependencies Material-UI Dialog components
 * @patterns Pass open state, onConfirm, onClose handlers
 * @usage <ConfirmDialog open={bool} onConfirm={fn} title="Delete?" message="Are you sure?" />
 */

import React from 'react';
import { 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions, 
  DialogContentText,
  Button 
} from '@mui/material';

const ConfirmDialog = ({
  open,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmColor = 'primary',
  loading = false,
  maxWidth = 'sm'
}) => {
  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth={maxWidth} 
      fullWidth
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {message}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          {cancelText}
        </Button>
        <Button 
          variant="contained" 
          color={confirmColor}
          disabled={loading}
          onClick={onConfirm}
        >
          {loading ? 'Processing...' : confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConfirmDialog;
