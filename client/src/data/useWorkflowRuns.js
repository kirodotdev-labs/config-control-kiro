/**
 * @fileoverview Kiro's workflow runs (read only). Runs that are still going
 * are re-read every few seconds so their status follows Kiro.
 */
import { useQuery } from '@tanstack/react-query';
import { workflowsApi } from '../services/api';
import { keys } from './keys';
import { useScope } from './useScope';

const LIVE = new Set(['running', 'paused']);
const every = (live) => (live ? 5000 : false);

/** The runs of this scope, newest first. */
export function useWorkflowRuns() {
  const scope = useScope();
  return useQuery({
    queryKey: keys.workflowRuns(scope), queryFn: workflowsApi.runs, staleTime: 0,
    refetchInterval: (q) => every((q.state.data || []).some((r) => LIVE.has(r.status))),
  });
}

/** One run with its plan (definition) and node states (root). */
export function useWorkflowRun(id) {
  const scope = useScope();
  return useQuery({
    queryKey: keys.workflowRun(scope, id), queryFn: () => workflowsApi.run(id), enabled: !!id, staleTime: 0, retry: false,
    refetchInterval: (q) => every(LIVE.has(q.state.data?.status)),
  });
}
