/**
 * @fileoverview Loading Overlay Component - Standardized loading states
 * @llm-purpose Full-screen loading overlay with optional message
 * @dependencies Material-UI Backdrop, CircularProgress
 * @patterns Pass open boolean and optional message
 * @usage <LoadingOverlay open={isLoading} message="Loading data..." />
 */

import React from 'react';
import { Backdrop, CircularProgress, Typography, Box } from '@mui/material';

const LoadingOverlay = ({ 
  open, 
  message = 'Loading...', 
  size = 40,
  sx = {} 
}) => {
  return (
    <Backdrop
      sx={{
        color: '#fff',
        zIndex: (theme) => theme.zIndex.drawer + 1,
        ...sx
      }}
      open={open}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <CircularProgress color="inherit" size={size} />
        {message && (
          <Typography variant="body1" sx={{ mt: 2 }}>
            {message}
          </Typography>
        )}
      </Box>
    </Backdrop>
  );
};

export default LoadingOverlay;
