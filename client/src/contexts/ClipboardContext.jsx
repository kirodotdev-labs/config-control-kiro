/**
 * @fileoverview Clipboard context for sharing copied data across components.
 */
import React, { createContext, useContext, useState } from 'react';

const ClipboardContext = createContext();

/**
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @returns {JSX.Element} Clipboard context provider
 */
export const ClipboardProvider = ({ children }) => {
  const [clipboard, setClipboard] = useState(null);

  return (
    <ClipboardContext.Provider value={{ clipboard, setClipboard }}>
      {children}
    </ClipboardContext.Provider>
  );
};

/** @returns {{clipboard: any, setClipboard: Function}} Clipboard state and setter */
export const useClipboard = () => {
  const context = useContext(ClipboardContext);
  if (!context) {
    throw new Error('useClipboard must be used within ClipboardProvider');
  }
  return context;
};
