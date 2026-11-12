/**
 * @fileoverview Kiro CLI chats and their credit usage, as listed by
 * `kiro-cli chat --list-sessions --all-cwds`. Listing takes a few seconds, so
 * the server keeps it for 20 seconds; a fast check of Kiro's lock files
 * every 3 seconds keeps the running dots current in between.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sessionsApi } from '../services/api';
import { keys } from './keys';

/**
 * Chats with the latest running state merged in.
 * @param {string} [folder] only chats started in this folder (a Workspace).
 * @param {{enabled?: boolean, live?: boolean}} [opts] live polls the running check.
 */
export function useSessions(folder = '', { enabled = true, live = false } = {}) {
  const query = useQuery({
    queryKey: keys.sessions(folder),
    queryFn: () => sessionsApi.overview({ folder }),
    enabled,
    staleTime: 15000,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });
  const running = useQuery({
    queryKey: keys.sessionsRunning,
    queryFn: sessionsApi.running,
    enabled: enabled && live && !!query.data && !query.data.problem,
    refetchInterval: 3000,
    refetchOnWindowFocus: true,
  });
  const fresh = running.data && query.data && Date.parse(running.data.checked) > Date.parse(query.data.checked);
  if (!fresh) return query;
  const open = new Set(running.data.running);
  return { ...query, data: { ...query.data, sessions: query.data.sessions.map((s) => (s.running === open.has(s.id) ? s : { ...s, running: open.has(s.id) })) } };
}

/** Re-asks kiro-cli now (the Refresh button). */
export function useRefreshSessions(folder = '') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => sessionsApi.overview({ refresh: true, folder }),
    onSuccess: (data) => qc.setQueryData(keys.sessions(folder), data),
  });
}

/** Tag changes; the cached chat lists are updated after. */
export function useChatActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['sessions'] });
  const patchTags = (id, tags) => qc.setQueriesData({ queryKey: ['sessions'] }, (old) => (old?.sessions
    ? { ...old, sessions: old.sessions.map((s) => (s.id === id ? { ...s, tags } : s)) } : old));
  return {
    setTags: useMutation({
      mutationFn: ({ id, tags }) => sessionsApi.setTags(id, tags),
      onSuccess: (res, { id }) => patchTags(id, res.tags),
    }),
    renameTag: useMutation({ mutationFn: ({ from, to }) => sessionsApi.renameTag(from, to), onSuccess: refresh }),
  };
}

/**
 * Open chats that use one of names, from whatever listing is already cached,
 * so saving an agent never waits for kiro-cli.
 * @returns {number}
 */
export function runningChatsFor(qc, names) {
  const cached = qc.getQueryData(keys.sessions(''));
  return cached ? cached.sessions.filter((s) => s.running && names.includes(s.agent)).length : 0;
}

/**
 * One agent's last 30 days. Chats record the agent by name, which is usually
 * its id; both are matched.
 * @param {string[]} names the agent's id and its name field.
 * @param {boolean} enabled
 * @returns {{usage: Object|undefined, running: number, loading: boolean, problem: Object|undefined, sessions: Object[]|undefined}}
 */
export function useAgentUsage(names, enabled) {
  const { data, isLoading } = useSessions('', { enabled });
  const usage = data?.usage?.byAgent?.find((a) => names.includes(a.name));
  const running = data ? data.sessions.filter((s) => s.running && names.includes(s.agent)).length : 0;
  return { usage, running, loading: enabled && isLoading, problem: data?.problem, sessions: data?.sessions };
}
