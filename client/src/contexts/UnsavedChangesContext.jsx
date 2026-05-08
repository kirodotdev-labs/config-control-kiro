/**
 * @fileoverview Unsaved changes guard context for preventing navigation with pending edits.
 */
import React, { createContext, useContext, useRef, useCallback } from 'react';

const UnsavedChangesContext = createContext();

/**
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @returns {JSX.Element} Unsaved changes context provider
 */
export const UnsavedChangesProvider = ({ children }) => {
  const guardRef = useRef(null);

  const register = useCallback((guard) => { guardRef.current = guard; }, []);
  const unregister = useCallback(() => { guardRef.current = null; }, []);
  const getGuard = useCallback(() => guardRef.current, []);

  return (
    <UnsavedChangesContext.Provider value={{ register, unregister, getGuard }}>
      {children}
    </UnsavedChangesContext.Provider>
  );
};

/** @returns {{register: Function, unregister: Function, getGuard: Function}} Guard registration functions */
export const useUnsavedChanges = () => useContext(UnsavedChangesContext);
