/**
 * @fileoverview What this agent may do, on top of the Global and Workspace
 * permissions.yaml: its rule cards, with the capabilities it can use marked,
 * and suggestions from its own MCP servers and skills.
 * Source: https://kiro.dev/docs/permissions/
 */
import { Stack, Typography } from '@mui/material';
import { useServerToolNames } from '../../../data/useAgents';
import { useSurfaces } from '../../../data/useSystem';
import { isObject } from '../../../domain/json.js';
import { agentCapabilities } from '../../../domain/permRows.js';
import { RulesEditor } from '../../permissions/RulesEditor';

/** @param {{id: string, spec: Object, serverNames: string[], onChange: (next: Object) => void}} props */
export function PermissionsSection({ id, spec, serverNames, onChange }) {
  const { data: measured = {} } = useServerToolNames(id);
  const { data: surfaces } = useSurfaces();
  const skills = (surfaces?.nodes?.find((n) => n.kind === 'skills')?.children || []).map((n) => n.name);
  const caps = agentCapabilities(spec, { hasServers: serverNames.length > 0, skillsAvailable: skills.length > 0 });
  const servers = Object.fromEntries(serverNames.map((s) => [s, measured[s] || []]));
  const permissions = isObject(spec.permissions) ? spec.permissions : {};
  const rules = Array.isArray(permissions.rules) ? permissions.rules : [];
  // Keep the permissions block even when empty: its presence marks the profile as V3.
  const setRules = (next) => onChange({ ...spec, permissions: { ...permissions, rules: next } });
  return (
    <Stack spacing={1.5}>
      <Typography variant="body2" color="text.secondary">
        Rules for this agent: deny beats ask, ask beats allow. Global and Workspace rules also apply.
      </Typography>
      <RulesEditor rules={rules} onChange={setRules} agentCaps={caps} servers={servers} skills={skills} />
    </Stack>
  );
}
