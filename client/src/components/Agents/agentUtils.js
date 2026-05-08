/**
 * @fileoverview Utility functions for agent field ordering and data normalization.
 */
// Utility to maintain consistent agent field ordering
export const orderAgentFields = (agent) => {
  return {
    name: agent.name,
    description: agent.description,
    prompt: agent.prompt,
    mcpServers: agent.mcpServers,
    ...(agent.includeMcpJson !== undefined && { includeMcpJson: agent.includeMcpJson }),
    ...(agent.useLegacyMcpJson !== undefined && { useLegacyMcpJson: agent.useLegacyMcpJson }),
    ...(agent.tools && { tools: agent.tools }),
    ...(agent.toolAliases && { toolAliases: agent.toolAliases }),
    ...(agent.allowedTools && { allowedTools: agent.allowedTools }),
    ...(agent.toolsSettings && { toolsSettings: agent.toolsSettings }),
    ...(agent.resources && { resources: agent.resources }),
    ...(agent.hooks && { hooks: agent.hooks }),
    ...(agent.model && { model: agent.model }),
    ...(agent.keyboardShortcut && { keyboardShortcut: agent.keyboardShortcut }),
    ...(agent.welcomeMessage && { welcomeMessage: agent.welcomeMessage }),
    // Include any other fields that might exist
    ...Object.fromEntries(
      Object.entries(agent).filter(([key]) => 
        !['name', 'description', 'prompt', 'mcpServers', 'includeMcpJson', 'useLegacyMcpJson', 'tools', 'toolAliases', 'allowedTools', 'toolsSettings', 'resources', 'hooks', 'model', 'keyboardShortcut', 'welcomeMessage'].includes(key)
      )
    )
  };
};
