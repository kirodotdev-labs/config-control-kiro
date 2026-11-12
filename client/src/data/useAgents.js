/**
 * @fileoverview Agent queries and mutations. Agents are addressed by id (file
 * stem); a save sends the complete spec and the server keeps key order,
 * unknown fields and the file's format.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { agentApi } from '../services/api';
import { keys } from './keys';
import { useScope } from './useScope';

/** Summaries of every agent in the active scope: [{id, name, description, model, toolCount, format}]. */
export function useAgentSummaries() {
  const scope = useScope();
  return useQuery({ queryKey: keys.agents(scope), queryFn: agentApi.list, staleTime: 0 });
}

/** Every agent id usable from this scope (this scope's plus Global's). */
export function useAllAgentIds() {
  const scope = useScope();
  return useQuery({ queryKey: [...keys.agents(scope), 'all-ids'], queryFn: agentApi.allIds, staleTime: 0 });
}

/** The full spec of one agent. */
export function useAgentSpec(id) {
  const scope = useScope();
  return useQuery({ queryKey: keys.agent(scope, id), queryFn: () => agentApi.get(id), enabled: !!id, staleTime: 0 });
}

/** Create, save and delete, each refreshing the lists that show agents. */
export function useAgentMutations() {
  const scope = useScope();
  const qc = useQueryClient();
  const refreshLists = () => Promise.all([
    qc.invalidateQueries({ queryKey: keys.agents(scope) }),
    qc.invalidateQueries({ queryKey: keys.surfaces(scope) }),
  ]);
  const create = useMutation({ mutationFn: agentApi.create, onSuccess: refreshLists });
  const save = useMutation({
    mutationFn: ({ id, spec }) => agentApi.update(id, spec),
    onSuccess: (saved, { id }) => {
      qc.setQueryData(keys.agent(scope, id), saved);
      // Its servers or tools may have changed: measure again, and redraw its connections.
      qc.invalidateQueries({ queryKey: keys.measure(scope, id) });
      qc.invalidateQueries({ queryKey: ['relations', scope] });
      return qc.invalidateQueries({ queryKey: keys.agents(scope) });
    },
  });
  const remove = useMutation({
    mutationFn: agentApi.remove,
    onSuccess: (_, id) => {
      qc.removeQueries({ queryKey: keys.agent(scope, id) });
      return refreshLists();
    },
  });
  return { create, save, remove };
}

/** The measured tools of the agent's MCP servers, by server: { [server]: string[] }. */
export function useServerToolNames(id) {
  const scope = useScope();
  return useQuery({ queryKey: keys.serverToolNames(scope, id), queryFn: () => agentApi.serverTools(id), enabled: !!id, staleTime: 0 });
}

/**
 * Measures the agent's MCP servers whose size isn't known yet, once when the
 * agent is opened (and again after a save), then refreshes what the
 * navigator and the agent's context show.
 * @returns {{measuring: boolean, result: Object|undefined}}
 */
export function useMeasureServers(id) {
  const scope = useScope();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: keys.measure(scope, id),
    queryFn: async () => {
      const result = await agentApi.measure(id);
      if (result.measured.length || Object.keys(result.failed).length) {
        await qc.invalidateQueries({ queryKey: ['relations', scope] });
        await qc.invalidateQueries({ queryKey: keys.serverToolNames(scope, id) });
      }
      return result;
    },
    enabled: !!id,
    staleTime: Infinity,
    retry: false,
  });
  return { measuring: query.isFetching, result: query.data };
}
