/**
 * @fileoverview The icon for each kind of configuration surface.
 */
import {
  AccountTree, AdminPanelSettings, Cable, Code, Psychology, Dns, AutoAwesome, Bolt, Insights, TextSnippet, VisibilityOff, Description, InsertDriveFile, Navigation, School, Security, Shield, SmartToy, Storage, Tune, Webhook,
} from '@mui/icons-material';
import { ACCENT } from '../../theme';

const ICONS = {
  agents: SmartToy, agent: SmartToy, mcp: Storage, mcpserver: Dns, permissions: Security, hooks: Webhook,
  hookfile: Webhook, steering: Navigation, skills: School, sandbox: Shield, file: Description,
  workflows: AccountTree, specs: AutoAwesome, powers: Bolt, settings: Tune, sessions: Insights, kiroignore: VisibilityOff, prompts: TextSnippet, policy: AdminPanelSettings, memory: Psychology, lsp: Code, acp: Cable, power: Bolt, powersource: Bolt, spec: AutoAwesome,
};

/** @param {{kind: string}} props */
export function SurfaceIcon({ kind }) {
  const Icon = ICONS[kind] || InsertDriveFile;
  return <Icon sx={{ fontSize: 18, color: kind === 'agent' ? ACCENT : undefined }} />;
}
