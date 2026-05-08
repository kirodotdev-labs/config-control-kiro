/**
 * @fileoverview Utility functions for hook type definitions and property helpers.
 */
// Hook utility functions
export const getHookTypes = () => [
  { value: 'agentSpawn', label: 'Agent Spawn', description: 'When agent is initialized' },
  { value: 'userPromptSubmit', label: 'User Prompt Submit', description: 'When user submits a message' },
  { value: 'preToolUse', label: 'Pre Tool Use', description: 'Before a tool is executed' },
  { value: 'postToolUse', label: 'Post Tool Use', description: 'After a tool is executed' },
  { value: 'stop', label: 'Stop', description: 'When assistant finishes responding' }
];

export const getCommonHookProperties = () => [
  'command',
  'matcher',
  'timeout_ms',
  'cache_ttl_seconds',
  'max_output_size'
];

export const getToolRelatedHookTypes = () => ['preToolUse', 'postToolUse'];

export const isToolRelatedHook = (hookType) => {
  return getToolRelatedHookTypes().includes(hookType);
};

export const getHookTypeLabel = (hookType) => {
  const type = getHookTypes().find(t => t.value === hookType);
  return type ? type.label : hookType;
};
