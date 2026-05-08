/**
 * @fileoverview Custom React hook for guarding unsaved changes with auto-save shortcuts and browser warnings.
 */
import { useState, useEffect, useCallback } from 'react';
import { useUnsavedChanges } from '../contexts/UnsavedChangesContext';

const useSaveGuard = ({ isDirty, isValid = true, onSave }) => {
  const [isSaving, setIsSaving] = useState(false);
  const { register, unregister } = useUnsavedChanges();

  const handleSave = useCallback(async () => {
    if (!isDirty || !isValid || isSaving) return false;
    setIsSaving(true);
    try {
      await onSave();
      return true;
    } catch (error) {
      console.error('Save failed:', error);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [isDirty, isValid, isSaving, onSave]);

  // Register/unregister dirty state with context
  useEffect(() => {
    if (isDirty) {
      register({ isDirty, isValid, save: handleSave });
    } else {
      unregister();
    }
    return () => unregister();
  }, [isDirty, isValid, handleSave, register, unregister]);

  // Browser tab close warning
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Ctrl+S keyboard shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave]);

  return { isSaving, handleSave };
};

export default useSaveGuard;
