/**
 * @fileoverview Reusable snackbar component for displaying notification alerts.
 */
import React from 'react';
import { Snackbar, Alert } from '@mui/material';

const NotificationSnackbar = ({ notification, onClose }) => {
  return (
    <Snackbar
      open={notification.open}
      autoHideDuration={6000}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
    >
      <Alert 
        onClose={onClose} 
        severity={notification.severity} 
        sx={{ width: '100%' }}
      >
        {notification.message}
      </Alert>
    </Snackbar>
  );
};

export default NotificationSnackbar;
