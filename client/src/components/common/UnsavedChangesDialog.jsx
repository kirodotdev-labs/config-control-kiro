/**
 * @fileoverview Dialog prompting users to save, discard, or cancel unsaved changes.
 */
import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button } from '@mui/material';

const UnsavedChangesDialog = ({ open, onSave, onDiscard, onCancel }) => (
  <Dialog open={open} onClose={onCancel}>
    <DialogTitle>Unsaved Changes</DialogTitle>
    <DialogContent>
      <DialogContentText>
        You have unsaved changes. What would you like to do?
      </DialogContentText>
    </DialogContent>
    <DialogActions>
      <Button onClick={onCancel}>Cancel</Button>
      <Button onClick={onDiscard} color="warning">Discard</Button>
      <Button onClick={onSave} variant="contained" color="primary">Save</Button>
    </DialogActions>
  </Dialog>
);

export default UnsavedChangesDialog;
