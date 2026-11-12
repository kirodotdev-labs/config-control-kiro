/**
 * @fileoverview In the launch dialog: what a V3 chat does with an agent that
 * still has CLI 2.x settings (Kiro upgrades it when the chat starts, or uses
 * its default agent instead), with the 2.x command to keep 2.x behaviour.
 * Removed with V2 support.
 */
import { Alert } from '@mui/material';
import { useKiroStatus } from '../../data/useKiro';
import { useScopeSettings } from '../../data/useSettings';
import { autoUpgrades } from '../../domain/v2.js';

/** @param {{v3?: {state: string, universal?: boolean, kiro?: string}, agentId: string}} props */
export function LaunchV2Note({ v3, agentId }) {
  const { data: status } = useKiroStatus();
  const { global } = useScopeSettings();
  if (!v3 || v3.state === 'v3' || v3.universal) return null;
  const auto = autoUpgrades(global, status?.version);
  const v2 = `kiro-cli chat --v2 --agent ${agentId}`;
  if (auto) {
    return (
      <Alert severity="info">
        {agentId} still has CLI 2.x settings. When this V3 chat starts, Kiro upgrades it first and keeps the original as a .bak file. To
        start it unchanged, run {v2} instead. To stop Kiro upgrading agents by itself, set chat.enableAutoAgentUpgrade to off in Global
        Settings.
      </Alert>
    );
  }
  return (
    <Alert severity={v3.state === 'blocked' ? 'warning' : 'info'}>
      {v3.state === 'blocked'
        ? `Kiro CLI V3 can't use ${agentId} until it's upgraded, so this chat starts Kiro's default agent instead. Upgrade it in the agent's Kiro CLI V3 card, or run ${v2}.`
        : `Kiro CLI V3 ignores some of ${agentId}'s 2.x settings. Upgrade it in the agent's Kiro CLI V3 card, or run ${v2}.`}
    </Alert>
  );
}
