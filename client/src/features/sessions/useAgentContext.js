/**
 * @fileoverview An agent's context before you type, for its Chats & usage
 * section. Opening the agent starts measuring its MCP servers not measured
 * yet; the breakdown fills in as they answer.
 */
import { useMemo } from 'react';
import { useMeasureServers } from '../../data/useAgents';
import { useModels } from '../../data/useKiro';
import { useRelations } from '../../data/useRelations';
import { useSurfaces } from '../../data/useSystem';
import { agentContext } from '../../domain/context.js';

/** Navigator id -> display name, for every row of the tree. */
function namesOf(nodes) {
  const names = new Map();
  const walk = (list) => (list || []).forEach((n) => { names.set(n.id, n.name); walk(n.children); });
  walk(nodes);
  return names;
}

/**
 * @param {string} id agent id.
 * @param {string} model the agent's model field ('' for Kiro's default).
 * @returns {{ctx: ReturnType<typeof agentContext>|null, window: number, modelName: string, measuring: boolean}}
 */
export function useAgentContext(id, model) {
  const { measuring } = useMeasureServers(id);
  const relations = useRelations({ id: `agent:${id}`, kind: 'agent' });
  const { data: surfaces } = useSurfaces();
  const { data: models } = useModels();
  const names = useMemo(() => namesOf(surfaces?.nodes), [surfaces]);
  const ctx = useMemo(() => (relations.data ? agentContext(relations.data, names) : null), [relations.data, names]);
  const picked = models?.models?.find((m) => m.id === (model || models.default));
  return { ctx, window: picked?.contextWindow || 0, modelName: picked?.name || model || models?.default || '', measuring };
}
