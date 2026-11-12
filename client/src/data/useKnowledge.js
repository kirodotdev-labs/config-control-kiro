/**
 * @fileoverview Data for an agent's Knowledge section: a file count for a
 * folder about to be indexed, and the two chat settings that decide whether
 * its knowledge bases are used (chat.defaultAgent, chat.enableKnowledge).
 */
import { useQuery } from '@tanstack/react-query';
import { knowledgeApi } from '../services/api';
import { useWorkspace } from '../contexts/WorkspaceContext';
import useDebounced from '../hooks/useDebounced';
import { formatJson } from '../domain/json.js';
import { effectiveDefaultAgent, knowledgeEnabled } from '../domain/knowledge.js';
import { useSaveFile } from './useFiles';
import { useScopeSettings } from './useSettings';
import { keys } from './keys';

/** How many files a folder with these patterns covers; waits until typing stops. */
export function useFolderEstimate(folder, include, exclude) {
  const args = useDebounced({ folder: folder.trim(), include, exclude }, 600);
  return useQuery({
    queryKey: keys.knowledgeEstimate(args.folder, args.include, args.exclude),
    queryFn: () => knowledgeApi.estimate(args.folder, args.include, args.exclude),
    enabled: !!args.folder, retry: false, staleTime: 30000,
  });
}

/**
 * The default agent and knowledge switch in effect for the active scope,
 * and setDefaultAgent(id), which writes chat.defaultAgent to the active
 * scope's cli.json, keeping every other setting.
 */
export function useChatDefaults() {
  const { isWorkspaceMode } = useWorkspace();
  const save = useSaveFile();
  const { global, workspace, scope, scopePath, ready } = useScopeSettings();
  return {
    ready,
    defaultAgent: effectiveDefaultAgent(global?.['chat.defaultAgent'], isWorkspaceMode ? workspace?.['chat.defaultAgent'] : undefined),
    knowledgeOn: knowledgeEnabled(global?.['chat.enableKnowledge'], isWorkspaceMode ? workspace?.['chat.enableKnowledge'] : undefined),
    saving: save.isPending,
    setDefaultAgent: (id, options) => save.mutate(
      { path: scopePath, content: `${formatJson({ ...scope, 'chat.defaultAgent': id })}\n` }, options,
    ),
  };
}
