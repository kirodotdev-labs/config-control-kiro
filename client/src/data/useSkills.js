/**
 * @fileoverview Skills of the active scope: the list, one skill with its
 * files and problems, and importing a skill folder.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { skillsApi } from '../services/api';
import { keys } from './keys';
import { useScope } from './useScope';

/** Every skill here: [{ name, dir, path, description, problems, files }]. */
export function useSkills() {
  const scope = useScope();
  return useQuery({ queryKey: keys.skills(scope), queryFn: skillsApi.list, staleTime: 0 });
}

/** One skill by folder name. */
export function useSkill(name) {
  const scope = useScope();
  return useQuery({ queryKey: keys.skill(scope, name), queryFn: () => skillsApi.get(name), enabled: !!name, staleTime: 0, retry: false });
}

/** Imports a skill from a GitHub folder URL or a local folder; refreshes the list and the navigator. */
export function useImportSkill() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: skillsApi.import,
    onSuccess: () => Promise.all([
      qc.invalidateQueries({ queryKey: keys.skills(scope) }),
      qc.invalidateQueries({ queryKey: keys.surfaces(scope) }),
    ]),
  });
}
