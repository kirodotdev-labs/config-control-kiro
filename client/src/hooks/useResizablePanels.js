/**
 * @fileoverview Custom React hook for resizable panel layout with drag support and optional persistence.
 */
import { useState, useCallback, useEffect } from 'react';
import usePersistedState from './usePersistedState';

export const useResizablePanels = (initialWidth = 40, persistKey = null, minWidth = 20, maxWidth = 80, orientation = 'vertical') => {
  // Use persisted state if key provided, otherwise regular state
  const [leftPanelWidth, setLeftPanelWidth] = persistKey 
    ? usePersistedState(persistKey, initialWidth)
    : useState(initialWidth);
    
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (isDragging) {
      const handleMouseMove = (e) => {
        const container = document.querySelector('[data-resizable-container]');
        if (!container) return;
        
        const rect = container.getBoundingClientRect();
        
        let newWidth;
        if (orientation === 'vertical') {
          newWidth = ((e.clientX - rect.left) / rect.width) * 100;
        } else {
          newWidth = ((e.clientY - rect.top) / rect.height) * 100;
        }
        
        const constrainedWidth = Math.min(Math.max(newWidth, minWidth), maxWidth);
        setLeftPanelWidth(constrainedWidth);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = orientation === 'vertical' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isDragging, minWidth, maxWidth, orientation]);

  return {
    leftPanelWidth,
    isDragging,
    handleMouseDown
  };
};

export default useResizablePanels;
