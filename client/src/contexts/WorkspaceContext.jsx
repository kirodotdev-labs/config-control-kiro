/**
 * @fileoverview The active configuration scope: Global (~/.kiro) or one saved
 * Workspace. Switching scope invalidates every cached query so each editor
 * reloads from the new scope.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { workspaceApi } from '../services/api';

const WorkspaceContext = createContext(null);

const EMPTY = { mode: 'global', activeWorkspace: '', workspaces: [], configPath: '' };

/** @param {{children: React.ReactNode}} props */
export function WorkspaceProvider({ children }) {
  const [state, setState] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  const apply = useCallback((data) => setState((prev) => ({
    mode: data.mode ?? prev.mode,
    activeWorkspace: data.activeWorkspace ?? prev.activeWorkspace,
    workspaces: data.workspaces ?? prev.workspaces,
    configPath: data.configPath ?? prev.configPath,
  })), []);

  const reload = useCallback(async () => {
    apply(await workspaceApi.context());
    setLoading(false);
  }, [apply]);

  useEffect(() => {
    reload().catch((err) => {
      console.error('Failed to load workspace context', err);
      setLoading(false);
    });
  }, [reload]);

  const switchTo = useCallback(async (mode, path = '') => {
    await workspaceApi.setContext(mode, path);
    await reload();
    await queryClient.invalidateQueries();
  }, [reload, queryClient]);

  const value = useMemo(() => ({
    ...state,
    loading,
    isWorkspaceMode: state.mode === 'workspace' && !!state.activeWorkspace,
    switchToGlobal: () => switchTo('global'),
    switchToWorkspace: (path) => switchTo('workspace', path),
    addWorkspace: async (path) => { apply(await workspaceApi.add(path)); },
    removeWorkspace: async (path) => {
      await workspaceApi.remove(path);
      await reload();
      await queryClient.invalidateQueries();
    },
  }), [state, loading, switchTo, apply, reload, queryClient]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

/** @returns {Object} scope state and switching functions. */
export const useWorkspace = () => useContext(WorkspaceContext);
