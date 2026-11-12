/**
 * @fileoverview What the selected navigator item is connected to. Fetched
 * only for the item you select, and refetched each time it is selected so
 * the connections reflect the files as they are now.
 */
import { useQuery } from '@tanstack/react-query';
import { relationsApi } from '../services/api';
import { keys } from './keys';
import { useScope } from './useScope';

/** Kinds whose relations are worth drawing (groups have none). */
const LINKABLE = new Set(['agent', 'file', 'hookfile', 'mcp', 'mcpserver', 'permissions', 'powers', 'sandbox']);

/** @param {{id: string, kind: string}|null} node */
export function useRelations(node) {
  const scope = useScope();
  return useQuery({
    queryKey: keys.relations(scope, node?.id),
    queryFn: () => relationsApi.get(node.id),
    enabled: !!node && LINKABLE.has(node.kind),
    staleTime: 0,
    retry: false,
  });
}
