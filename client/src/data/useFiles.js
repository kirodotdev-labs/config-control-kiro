/**
 * @fileoverview Plain files by absolute path, directory listings and path
 * resolution (Linux, macOS and Windows formats).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fileApi } from '../services/api';
import { keys } from './keys';
import { useScope } from './useScope';

/**
 * The text of one file: { content, exists }. Pass enabled=false for a file known not to exist,
 * or optional=true for one that may not (it then reads as exists=false, not an error).
 */
export const useFileText = (path, enabled = true, optional = false) =>
  useQuery({ queryKey: keys.file(path), queryFn: () => fileApi.read(path, optional), enabled: !!path && enabled, staleTime: 0, retry: false });

/** Folders and files in a directory: { path, folders, files }. */
export const useDirectory = (path) =>
  useQuery({ queryKey: keys.dir(path), queryFn: () => fileApi.browse(path), enabled: !!path, staleTime: 0, retry: false });

/**
 * Writes a file. With createOnly, an existing file is never overwritten.
 * Refreshes the file cache and the navigator.
 */
export function useSaveFile() {
  const refresh = useRefreshAfterWrite();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, content, createOnly = false }) => fileApi.save(path, content, createOnly),
    onSuccess: (_, { path, content }) => {
      qc.setQueryData(keys.file(path), { content });
      return refresh();
    },
  });
}

/**
 * Copies an existing file into a skill or power folder ({source, dest, overwrite}).
 * Without overwrite an existing dest is refused. Refreshes the navigator.
 */
export function useCopyFile() {
  const refresh = useRefreshAfterWrite();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ source, dest, overwrite = false }) => fileApi.copy(source, dest, overwrite),
    onSuccess: (_, { dest }) => {
      qc.removeQueries({ queryKey: keys.file(dest) });
      qc.invalidateQueries({ queryKey: keys.dir(dest.replace(/[\\/][^\\/]*$/, '')) });
      return refresh();
    },
  });
}

/** Refetches what a written file can change: the navigator, permissions, skills and powers. */
function useRefreshAfterWrite() {
  const scope = useScope();
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: keys.surfaces(scope) }),
    qc.invalidateQueries({ queryKey: keys.permissions(scope) }),
    qc.invalidateQueries({ queryKey: ['skill', scope] }),
    qc.invalidateQueries({ queryKey: keys.skills(scope) }),
    qc.invalidateQueries({ queryKey: ['power-source'] }),
    qc.invalidateQueries({ queryKey: keys.powerSources }),
  ]);
}

/**
 * Deletes a file, or a skill or spec folder. The server allows only the
 * scope's hooks, steering, skills, prompts, workflows and specs. Refreshes
 * the navigator.
 */
export function useDeleteFile() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path) => fileApi.remove(path),
    onSuccess: (_, path) => {
      qc.removeQueries({ queryKey: keys.file(path) });
      qc.removeQueries({ queryKey: ['skill', scope] }); // a deleted skill or power source must not be refetched
      qc.removeQueries({ queryKey: ['power-source'] });
      return Promise.all([
        qc.invalidateQueries({ queryKey: keys.surfaces(scope) }),
        qc.invalidateQueries({ queryKey: keys.skills(scope) }),
        qc.invalidateQueries({ queryKey: keys.powerSources }),
      ]);
    },
  });
}

/** Resolves a pasted path: { valid, exists, type, resolvedPath, parentPath, error }. */
export const resolvePath = fileApi.resolve;
