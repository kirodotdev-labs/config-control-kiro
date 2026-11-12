/**
 * @fileoverview mcp.json and live MCP tool discovery. Tools are listed per
 * server and only when a view asks (a server row is expanded), so opening an
 * agent never waits on every server starting up.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mcpApi } from '../services/api';
import { keys } from './keys';
import { useScope } from './useScope';

/** mcp.json for the active scope: { config, path, exists }. */
export function useMcpConfig() {
  const scope = useScope();
  return useQuery({ queryKey: keys.mcpConfig(scope), queryFn: mcpApi.config, staleTime: 0, retry: false });
}

/** Saves mcp.json; the cache is updated with what was written. */
export function useSaveMcpConfig() {
  const scope = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: mcpApi.saveConfig,
    onSuccess: ({ path }, config) => {
      qc.setQueryData(keys.mcpConfig(scope), { config, path, exists: true });
      // Agents that include mcp.json may now get other servers: measure them again.
      qc.invalidateQueries({ queryKey: ['measure', scope] });
      return qc.invalidateQueries({ queryKey: keys.surfaces(scope) });
    },
  });
}

/**
 * Tools of one server, fetched lazily and cached per server config, so a
 * second look (or the same server in another agent) is instant.
 * @param {string} name
 * @param {Object} cfg the server's config entry.
 * @param {boolean} enabled fetch only when true (e.g. the row is open).
 * @returns query whose data is { tools: [{name, description}], error?: string }.
 */
export function useServerTools(name, cfg, enabled) {
  // Only connection settings decide the tool list; toggling a tool off must not refetch.
  const { command, args, env, url, headers } = cfg || {};
  const connection = { command, args, env, url, headers };
  return useQuery({
    queryKey: keys.serverTools(name, connection),
    queryFn: async () => (await mcpApi.tools({ [name]: connection }))[name] || { tools: [] },
    enabled: enabled && !!name && !cfg?.disabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
