/**
 * @fileoverview The agent form: one collapsible section per concern, in the
 * order of the agent file's fields (kiro.dev/docs/custom-agents/configuration-reference).
 * Each section edits only its own fields; everything else in the spec is passed
 * through untouched. Activating a section highlights its JSON.
 */
import { useEffect } from 'react';
import { Alert, Box, Stack, Typography } from '@mui/material';
import { uneditedKeys } from '../../domain/agentKeys.js';
import {
  Bolt, Build, Chat, CheckCircleOutlined, Extension, History, Hub, Insights, Memory, MenuBook, Person, Security, Storage, Warning, Webhook,
} from '@mui/icons-material';
import { subagentMode, subagentTargets } from '../../domain/subagents.js';
import { hookCount } from '../../domain/hooks.js';
import { hasV2Subagents, isV2Hooks } from '../../domain/v2.js';
import { isObject, stringList } from '../../domain/json.js';
import { useMcpConfig } from '../../data/useMcp';
import { SectionCard } from '../../ui/SectionCard';
import ErrorBoundary from '../../ui/ErrorBoundary';
import { IdentitySection } from './sections/IdentitySection';
import { ModelSection } from './sections/ModelSection';
import { ToolsSection } from './sections/ToolsSection';
import { McpSection } from './sections/McpSection';
import { PermissionsSection } from './sections/PermissionsSection';
import { ResourcesSection } from './sections/ResourcesSection';
import { KnowledgeSection } from './sections/KnowledgeSection';
import { isKnowledgeBase } from '../../domain/knowledge.js';
import { HooksSection } from './sections/HooksSection';
import { SubagentsSection } from './sections/SubagentsSection';
import { WelcomeSection } from './sections/WelcomeSection';
import { V3Section } from '../v2/V3Section';
import { PowersSection } from './sections/PowersSection';
import { AgentChatsSection } from '../sessions/AgentChatsSection';
import { useAgentContext } from '../sessions/useAgentContext';
import { shortTokens } from '../../domain/context.js';
import { useAgentUsage } from '../../data/useSessions';
import { kiroBlocker, useKiroStatus } from '../../data/useKiro';
import { formatCredits } from '../../domain/sessions.js';

const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** 2.x: the folded Kiro CLI V3 card's one line. */
function v3Summary(v3) {
  if (v3.kiro === 'out-of-sync') return 'Upgraded by Kiro, then edited: out of sync';
  if (v3.universal) return `Upgraded by Kiro${v3.notCarried?.length ? ` · ${count(v3.notCarried.length, 'setting')} only in 2.x` : ''}`;
  if (v3.state === 'v3') return 'The original is kept as a backup';
  return `${count((v3.converted || []).length + (v3.notCarried || []).length, 'CLI 2.x setting')}`;
}

/**
 * @param {Object} props
 * @param {string} props.id
 * @param {string} props.format 'json' | 'md'
 * @param {Object} props.spec
 * @param {(next: Object) => void} props.onChange
 * @param {string} props.active id of the highlighted section.
 * @param {(sectionId: string) => void} props.onActivate
 * @param {{id: string, n: number}} [props.reveal] open and scroll to a section (bumped by the JSON pane).
 * @param {(ids: string[]) => void} [props.onSections] told which section ids are rendered.
 * @param {Object} [props.v3] readiness from the server (agent summary).
 * @param {boolean} props.dirty
 * @param {(kind: string) => void} [props.onOpenKind] open the scope's item of that kind (sessions, powers).
 */
export function AgentForm({ id, format, spec, onChange, active, onActivate, reveal, onSections, v3, dirty, onOpenKind }) {
  const tools = stringList(spec.tools);
  const own = Object.keys(isObject(spec.mcpServers) ? spec.mcpServers : {});
  const mcpJson = useMcpConfig().data?.config?.mcpServers;
  const shared = spec.includeMcpJson ? Object.keys(isObject(mcpJson) ? mcpJson : {}) : [];
  const serverNames = [...new Set([...own, ...shared])];
  const rules = Array.isArray(spec.permissions?.rules) ? spec.permissions.rules.length : 0;
  const props = { spec, onChange };
  const resources = Array.isArray(spec.resources) ? spec.resources : [];
  const knowledge = resources.filter(isKnowledgeBase).length;
  const { data: status } = useKiroStatus();
  const blocker = kiroBlocker(status, 'sessions');
  const names = [id, typeof spec.name === 'string' ? spec.name : ''].filter(Boolean);
  const agentUsage = useAgentUsage(names, !!status && !blocker);
  const context = useAgentContext(id, typeof spec.model === 'string' ? spec.model : '');
  const usageSummary = [
    context.ctx && `≈ ${shortTokens(context.ctx.total)} tokens before you type`,
    agentUsage.loading ? 'reading your chats…' : agentUsage.usage?.chats ? `${formatCredits(agentUsage.usage.credits)} credits in 30 days` : 'no recent chats',
    agentUsage.running > 0 && `${agentUsage.running} running`,
  ].filter(Boolean).join(' · ');

  // 2.x: a 2.x setting is pending while Kiro hasn't upgraded the agent.
  const pendingV2 = !!v3 && !v3.universal && v3.state !== 'v3';
  const sections = [
    // 2.x: the V3 upgrade section; remove with V2 support.
    v3 && (v3.state !== 'v3' || v3.universal || v3.backup || v3.kiro === 'error') && {
      id: 'v2', title: 'Kiro CLI V3', icon: v3.state === 'v3' && v3.kiro !== 'out-of-sync' ? <CheckCircleOutlined /> : <Warning />,
      badge: v3.kiro === 'out-of-sync' ? 'out of sync' : v3.kiro === 'error' ? "Kiro can't read it" : { blocked: 'CLI 2.x agent', upgrade: 'needs upgrade' }[v3.state] || '',
      summary: v3Summary(v3),
      body: <V3Section id={id} v3={v3} dirty={dirty} />, open: v3.state === 'blocked' || v3.kiro === 'out-of-sync',
    },
    { id: 'identity', title: 'Identity and prompt', icon: <Person />, summary: spec.description || 'Description and system prompt',
      body: <IdentitySection {...props} id={id} format={format} />, open: true },
    { id: 'mcp', title: 'MCP servers', icon: <Storage />, summary: `${count(own.length, 'server')}${spec.includeMcpJson ? ' + mcp.json' : ''}`, body: <McpSection {...props} /> },
    { id: 'tools', title: 'Tools', icon: <Build />, summary: tools.length ? tools.join(', ') : 'No tools', body: <ToolsSection {...props} id={id} serverNames={serverNames} /> },
    { id: 'permissions', title: 'Permissions', icon: <Security />, summary: count(rules, 'rule'), body: <PermissionsSection {...props} id={id} serverNames={serverNames} /> },
    { id: 'subagents', title: 'Sub-agents', icon: <Hub />, summary: { none: 'None', some: subagentTargets(spec.tools).join(', '), any: 'Any agent' }[subagentMode(spec.tools).mode],
      badge: hasV2Subagents(spec) && pendingV2 ? 'CLI 2.x format' : '' /* 2.x */, body: <SubagentsSection {...props} v2={hasV2Subagents(spec) && pendingV2} /> },
    { id: 'resources', title: 'Context', icon: <Extension />, summary: count(resources.length - knowledge, 'resource'), body: <ResourcesSection {...props} /> },
    { id: 'knowledge', title: 'Knowledge', icon: <MenuBook />, summary: count(knowledge, 'knowledge base'), body: <KnowledgeSection {...props} id={id} /> },
    { id: 'powers', title: 'Powers', icon: <Bolt />, summary: spec.includePowers === true ? 'Included' : 'Not included',
      body: <PowersSection {...props} onOpenPowers={onOpenKind && (() => onOpenKind('powers'))} /> },
    { id: 'hooks', title: 'Hooks', icon: <Webhook />, summary: count(hookCount(spec.hooks), 'hook'), badge: isV2Hooks(spec.hooks) && pendingV2 ? 'CLI 2.x format' : '' /* 2.x */, body: <HooksSection {...props} serverNames={serverNames} /> },
    { id: 'model', title: 'Model', icon: <Memory />, summary: [spec.model || 'Kiro default', typeof spec.effortLevel === 'string' && spec.effortLevel ? `${spec.effortLevel} effort` : ''].filter(Boolean).join(' · '), body: <ModelSection {...props} /> },
    { id: 'welcome', title: 'Welcome message', icon: <Chat />, summary: spec.welcomeMessage || 'None', body: <WelcomeSection {...props} /> },
    { id: 'usage', title: 'Chats & usage', icon: <Insights />, summary: usageSummary, badge: agentUsage.running ? 'in use' : '',
      body: <AgentChatsSection context={context} chats={agentUsage} names={names} blocker={blocker} onOpenChats={onOpenKind && (() => onOpenKind('sessions'))} /> },
  ].filter(Boolean);
  const ids = sections.map((s) => s.id);
  const idKey = ids.join(',');
  useEffect(() => { onSections?.(idKey.split(',')); }, [idKey, onSections]);
  const other = uneditedKeys(spec, ids);

  return (
    <Stack spacing={1.5} sx={{ p: 2 }}>
      {sections.map((s) => (
        <ErrorBoundary key={s.id} resetKeys={[id]} fallback={
          <Alert severity="warning" icon={<History />}>{s.title} holds a value this form can’t show. Edit it in the JSON on the right.</Alert>
        }>
          <SectionCard icon={s.icon} title={s.title} summary={s.summary} badge={s.badge}
            active={active === s.id} onActivate={() => onActivate(s.id)} defaultOpen={s.open} reveal={reveal?.id === s.id ? reveal.n : 0}>
            {s.body}
          </SectionCard>
        </ErrorBoundary>
      ))}
      {other.length > 0 && (
        <Box sx={{ px: 1 }}>
          <Typography variant="overline" color="text.secondary">Also in this file</Typography>
          {other.map(({ key, note }) => (
            <Typography key={key} variant="body2" color="text.secondary" sx={{ cursor: 'pointer' }} onClick={() => onActivate(`key:${key}`)}>
              <Box component="code" sx={{ color: active === `key:${key}` ? 'primary.main' : 'text.primary' }}>{key}</Box>: {note}
            </Typography>
          ))}
        </Box>
      )}
    </Stack>
  );
}
