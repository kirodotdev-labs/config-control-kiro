/**
 * @fileoverview Resizable Divider Component
 * @llm-purpose Reusable vertical divider for split-panel layouts with visual indicator
 */

import React from 'react';
import { Box } from '@mui/material';

const ResizableDivider = ({ onMouseDown, isDragging = false, orientation = 'vertical' }) => {
  const isVertical = orientation === 'vertical';
  
  return (
    <Box
      onMouseDown={onMouseDown}
      sx={{
        width: isVertical ? '8px' : '100%',
        height: isVertical ? '100%' : '8px',
        backgroundColor: 'divider',
        cursor: isVertical ? 'col-resize' : 'row-resize',
        flexShrink: 0,
        position: 'relative',
        '&:hover': {
          backgroundColor: 'primary.main',
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: isVertical ? '3px' : '30px',
          height: isVertical ? '30px' : '3px',
          backgroundColor: 'text.secondary',
          borderRadius: '2px',
          opacity: 0.5,
        },
        '&:hover::after': {
          opacity: 1,
          backgroundColor: 'primary.contrastText',
        },
        ...(isDragging && {
          backgroundColor: 'primary.main',
          '&::after': {
            opacity: 1,
            backgroundColor: 'primary.contrastText',
          }
        })
      }}
    />
  );
};

export default ResizableDivider;
