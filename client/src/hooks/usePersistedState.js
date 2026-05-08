/**
 * @fileoverview Custom React hook for persisting state to localStorage.
 */
import { useState, useEffect } from 'react';

/**
 * Custom hook for persisting state to localStorage
 * @param {string} key - localStorage key
 * @param {any} defaultValue - default value if nothing in localStorage
 * @returns {[any, function]} - [state, setState] tuple like useState
 */
const usePersistedState = (key, defaultValue) => {
  const [state, setState] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : defaultValue;
    } catch (error) {
      console.error(`Error loading persisted state for key "${key}":`, error);
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
      console.error(`Error saving persisted state for key "${key}":`, error);
    }
  }, [key, state]);

  return [state, setState];
};

export default usePersistedState;
