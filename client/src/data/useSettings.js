/**
 * @fileoverview permissions.yaml, sandbox.json and Kiro's memories for the
 * active scope, and the Kiro CLI settings (cli.json) of Global and the
 * active Workspace.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { memoryApi, permissionsApi, sandboxApi } from '../services/api';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { formatJson, isObject, parseJson, setField } from '../domain/json.js';
import { useFileText, useSaveFile } from './useFiles';
import { keys } from './keys';
import { useScope } from './useScope';
import { useSurfaces, useSystemInfo } from './useSystem';

/** Kiro's memories for this scope, re-read when the window regains focus: { memories, repo, elsewhere, stores }. */
export function useMemories() {
  const scope = useScope();
  return useQuery({ queryKey: keys.memories(scope), queryFn: memoryApi.list, staleTime: 0, refetchOnWindowFocus: true });
}

/** New, edit and delete memories through Kiro; each answers the new list, which replaces the cached one. */
export function useMemoryActions() {
  const scope = useScope();
  const qc = useQueryClient();
  const done = { onSuccess: (list) => qc.setQueryData(keys.memories(scope), list) };
  return {
    create: useMutation({ mutationFn: memoryApi.create, ...done }),
    update: useMutation({ mutationFn: ({ id, draft }) => memoryApi.update(id, draft), ...done }),
    remove: useMutation({ mutationFn: memoryApi.remove, ...done }),
  };
}

/** { rules, policies, path, exists } */
export function usePermissions() {
  const scope = useScope();
  return useQuery({ queryKey: keys.permissions(scope), queryFn: permissionsApi.get, staleTime: 0, retry: false });
}

/** { capabilities, effects, presets } — the vocabulary the server validates against. */
export const usePermissionsMeta = () =>
  useQuery({ queryKey: keys.permissionsMeta, queryFn: permissionsApi.meta, staleTime: Infinity });

/** { config, path, exists } */
export function useSandbox() {
  const scope = useScope();
  return useQuery({ queryKey: keys.sandbox(scope), queryFn: sandboxApi.get, staleTime: 0, retry: false });
}

export function useSaveSandbox() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: sandboxApi.save,
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: keys.sandbox(scope) }),
      qc.invalidateQueries({ queryKey: keys.surfaces(scope) }),
    ]),
  });
}

/** A cli.json's settings: {} when the file is missing, null while loading or when it isn't valid JSON. */
function useCliJson(path, enabled) {
  const file = useFileText(path, enabled, true);
  if (!enabled) return {};
  if (!file.data) return null;
  const { value, error } = parseJson(file.data.content || '{}');
  return error || !isObject(value) ? null : value;
}

/**
 * Sets one setting in the Global cli.json, keeping every other key; undefined
 * removes it. Refuses when the file isn't valid JSON, so it's never overwritten.
 * @returns {{set: (key: string, value: any) => Promise<void>, saving: boolean, ready: boolean}}
 */
export function useSetGlobalSetting() {
  const { data: info } = useSystemInfo();
  const path = info?.globalPath ? `${info.globalPath}/settings/cli.json` : '';
  const file = useFileText(path, !!path, true);
  const save = useSaveFile();
  const set = async (key, value) => {
    const { value: current, error } = parseJson(file.data?.exists === false ? '{}' : file.data?.content || '{}');
    if (error || !isObject(current)) throw new Error("The Global cli.json isn't valid JSON. Fix it in Global Settings first.");
    await save.mutateAsync({ path, content: `${formatJson(setField(current, key, value))}\n` });
    await file.refetch();
  };
  return { set, saving: save.isPending, ready: !!path && !!file.data };
}

/**
 * The Kiro CLI settings of the Global cli.json and, in a Workspace, its own
 * cli.json, read as they are on disk.
 * @returns {{global: Object|null, workspace: Object|null, scope: Object|null, scopePath: string, ready: boolean}}
 *   scope is the active scope's settings; workspace is {} in Global.
 */
export function useScopeSettings() {
  const { isWorkspaceMode } = useWorkspace();
  const { data: info } = useSystemInfo();
  const { data: surfaces } = useSurfaces();
  const node = surfaces?.nodes?.find((n) => n.kind === 'settings');
  const scopePath = node?.path || '';
  const scopeExists = !!node?.exists; // a missing file reads as {} without asking the server
  const globalPath = isWorkspaceMode ? (info?.globalPath ? `${info.globalPath}/settings/cli.json` : '') : scopePath;
  const global = useCliJson(globalPath, !!globalPath && (isWorkspaceMode || scopeExists));
  const workspace = useCliJson(scopePath, isWorkspaceMode && scopeExists);
  return { global, workspace, scope: isWorkspaceMode ? workspace : global, scopePath, ready: global !== null && workspace !== null };
}
