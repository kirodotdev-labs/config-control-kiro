/**
 * @fileoverview The active scope's identity, used to key scope-bound queries.
 */
import { useWorkspace } from '../contexts/WorkspaceContext';

/** @returns {string} the active .kiro path (changes when the scope switches). */
export const useScope = () => useWorkspace().configPath;
