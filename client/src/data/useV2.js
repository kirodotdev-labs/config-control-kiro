/**
 * @fileoverview Queries for Kiro CLI 2.x support only: deleting 2.x chats,
 * and Kiro's upgrade of 2.x agent configs to V3. Removed with V2 support.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { v2Api } from '../services/api';
import { keys } from './keys';
import { useScope } from './useScope';

/** Deletes 2.x chats through kiro-cli; every cached chat list is refreshed after. */
export function useDeleteV2Chats() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, onlyEmpty }) => v2Api.deleteChats(ids, onlyEmpty),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });
}

/**
 * Kiro's upgrade for one agent: preview (no changes), apply, and restore the
 * backup. Apply and restore reload the agent and the lists.
 */
export function useAgentUpgrade(id) {
  const scope = useScope();
  const qc = useQueryClient();
  const reload = () => Promise.all([
    qc.invalidateQueries({ queryKey: keys.agent(scope, id) }),
    qc.invalidateQueries({ queryKey: keys.agents(scope) }),
  ]);
  return {
    preview: useMutation({ mutationFn: () => v2Api.previewUpgrade(id) }),
    apply: useMutation({ mutationFn: (hash) => v2Api.applyUpgrade(id, hash), onSuccess: reload }),
    restore: useMutation({ mutationFn: () => v2Api.restore(id), onSuccess: reload }),
  };
}

/** Kiro's upgrade over every agent in the scope; `dryRun` only reports. */
export function useUpgradeAll() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dryRun) => v2Api.upgradeAll(dryRun),
    onSuccess: (_, dryRun) => !dryRun && Promise.all([
      qc.invalidateQueries({ queryKey: keys.agents(scope) }),
      qc.invalidateQueries({ queryKey: ['agent', scope] }),
    ]),
  });
}

