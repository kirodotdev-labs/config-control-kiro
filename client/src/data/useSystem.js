/**
 * @fileoverview System-level queries: host info, kiro-cli models, the app
 * self-updater and the active scope's configuration surfaces.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { codeIntelApi, systemApi, updateApi } from '../services/api';
import { keys } from './keys';
import { useScope } from './useScope';

/** Host platform, WSL flag, home dir and app version. */
export const useSystemInfo = () =>
  useQuery({ queryKey: keys.systemInfo, queryFn: systemApi.info, staleTime: Infinity });

/**
 * The self-updater's state, polled every minute, and every two seconds while it
 * hasn't settled (checking, downloading, restarting) so the page notices the new version.
 */
export function useUpdate() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: keys.version, queryFn: updateApi.status, retry: false,
    refetchInterval: (query) => (['idle', 'checking', 'downloading', 'applying'].includes(query.state.data?.state) || query.state.error ? 2000 : 60000),
  });
  const done = { onSuccess: (s) => s?.current && qc.setQueryData(keys.version, s) };
  return {
    ...q,
    check: useMutation({ mutationFn: updateApi.check, ...done }),
    apply: useMutation({ mutationFn: updateApi.apply, onSuccess: () => qc.setQueryData(keys.version, (s) => ({ ...s, state: 'applying' })) }),
    setAuto: useMutation({ mutationFn: updateApi.settings, ...done }),
  };
}

/** The active scope's surface tree: { nodes: SurfaceNode[] }. */
export function useSurfaces({ enabled = true } = {}) {
  const scope = useScope();
  return useQuery({ queryKey: keys.surfaces(scope), queryFn: systemApi.surfaces, enabled, staleTime: 0 });
}

/** The Workspace's languages and which language servers are installed: { detected, installed }. */
export function useCodeIntel(commands) {
  const scope = useScope();
  const list = [...new Set(commands)].sort();
  return useQuery({ queryKey: keys.codeIntel(scope, list.join(',')), queryFn: () => codeIntelApi.info(list), staleTime: 30 * 1000, refetchOnWindowFocus: true });
}
