/**
 * @fileoverview Workspace context for managing global vs workspace-scoped configuration.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useQueryClient } from 'react-query';
import { workspaceService } from '../services/api';

const WorkspaceContext = createContext();

/**
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @returns {JSX.Element} Workspace context provider
 */
export function WorkspaceProvider({ children }) {
  const [mode, setMode] = useState('global');
  const [activeWorkspace, setActiveWorkspace] = useState('');
  const [workspaces, setWorkspaces] = useState([]);
  const [configPath, setConfigPath] = useState('~/.kiro');
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  const invalidateAll = () => queryClient.invalidateQueries();

  const applyData = (data) => {
    if (data.mode !== undefined) setMode(data.mode);
    if (data.activeWorkspace !== undefined) setActiveWorkspace(data.activeWorkspace || '');
    if (data.workspaces) setWorkspaces(data.workspaces);
    if (data.configPath) setConfigPath(data.configPath);
  };

  const refresh = useCallback(async () => {
    try {
      const data = await workspaceService.getContext();
      applyData(data);
    } catch (err) {
      console.error('Failed to load workspace context', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const switchToGlobal = async () => {
    const data = await workspaceService.setContext('global');
    applyData(data);
    const ctx = await workspaceService.getContext();
    applyData(ctx);
    invalidateAll();
  };

  const switchToWorkspace = async (path) => {
    const data = await workspaceService.setContext('workspace', path);
    applyData(data);
    const ctx = await workspaceService.getContext();
    applyData(ctx);
    invalidateAll();
  };

  const addWorkspace = async (path) => {
    const data = await workspaceService.addWorkspace(path);
    if (data.workspaces) setWorkspaces(data.workspaces);
  };

  const removeWorkspace = async (path) => {
    const data = await workspaceService.removeWorkspace(path);
    if (data.workspaces) setWorkspaces(data.workspaces);
    if (data.mode) setMode(data.mode);
    if (data.mode === 'global') setActiveWorkspace('');
    const ctx = await workspaceService.getContext();
    applyData(ctx);
    invalidateAll();
  };

  const isWorkspaceMode = mode === 'workspace' && activeWorkspace !== '';

  return (
    <WorkspaceContext.Provider value={{
      mode, activeWorkspace, workspaces, configPath, loading,
      isWorkspaceMode, switchToGlobal, switchToWorkspace,
      addWorkspace, removeWorkspace, refresh,
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

/** @returns {Object} Workspace state, mode, and switching functions */
export const useWorkspace = () => useContext(WorkspaceContext);
