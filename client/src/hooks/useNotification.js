/**
 * @fileoverview Unified Notification Hook - Centralized notification system
 * @llm-purpose Provides showNotification, hideNotification, and notification state
 * @dependencies React useState, useCallback
 * @patterns Standard hook pattern - import and destructure what you need
 * @usage const { showNotification, notification, hideNotification } = useNotification();
 */

import { useState, useCallback } from 'react';

export const useNotification = () => {
  const [notification, setNotification] = useState({ 
    open: false, 
    message: '', 
    severity: 'info' 
  });

  const showNotification = useCallback((message, severity = 'info') => {
    setNotification({ open: true, message, severity });
  }, []);

  const hideNotification = useCallback(() => {
    setNotification(prev => ({ ...prev, open: false }));
  }, []);

  return { 
    notification, 
    showNotification, 
    hideNotification,
    setNotification 
  };
};

export default useNotification;
