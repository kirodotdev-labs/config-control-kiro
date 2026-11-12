/**
 * @fileoverview Which tools the agent can see (the `tools` field) and which
 * it must never see (`excludedTools`). What the tools may do is set in the
 * Permissions section. Both lists suggest Kiro's built-in tool IDs and the
 * measured tools of the agent's MCP servers; anything else can be typed.
 */
import { Alert, Box, Checkbox, Divider, FormControlLabel, Stack, Switch, Typography } from '@mui/material';
import {
  ALL_BUILTIN, ALL_MCP, ALL_TOOLS, BUILTIN_SELECTORS, BUILTIN_TOOLS, TOOL_TAGS, grantsBuiltin, grantsServer, unknownTools,
} from '../../../domain/kiroTools.js';
import { useServerToolNames } from '../../../data/useAgents';
import { setField, stringList } from '../../../domain/json.js';
import { ListInput } from '../../../ui/ListInput';

/** Adds or removes item, keeping the rest of the list in place. */
const toggle = (list, item, on) => (on ? (list.includes(item) ? list : [...list, item]) : list.filter((x) => x !== item));

const DETAIL = Object.fromEntries([...BUILTIN_TOOLS, ...BUILTIN_SELECTORS].map((b) => [b.id, b.detail]));

/** @param {{id: string, spec: Object, serverNames: string[], onChange: (next: Object) => void}} props */
export function ToolsSection({ id, spec, serverNames, onChange }) {
  const tools = stringList(spec.tools);
  const excluded = stringList(spec.excludedTools);
  const { data: measured = {} } = useServerToolNames(id);
  const mcpTools = Object.entries(measured).flatMap(([server, names]) => names.map((t) => `@${server}/${t}`));
  const describe = (o) => DETAIL[o] || (o.startsWith('@') && o.includes('/') ? `One tool of the ${o.slice(1, o.indexOf('/'))} MCP server`
    : o.startsWith('@') ? `Every tool of the ${o.slice(1)} MCP server` : TOOL_TAGS.includes(o) ? `Every ${o} tool` : '');
  const unknown = unknownTools([...tools, ...excluded], 'kiroUpgrade' in spec);
  const setTools = (next) => onChange(setField(spec, 'tools', next, { keepEmpty: 'tools' in spec }));
  const everything = tools.includes(ALL_TOOLS);
  const allBuiltin = everything || tools.includes(ALL_BUILTIN);
  const allMcp = everything || tools.includes(ALL_MCP);
  const shown = new Set([ALL_TOOLS, ALL_BUILTIN, ALL_MCP, ...BUILTIN_SELECTORS.map((b) => b.id), ...serverNames.map((s) => `@${s}`)]);
  // subagent/<name> entries belong to the Sub-agents section.
  const owned = (t) => shown.has(t) || t.startsWith('subagent/');
  const others = tools.filter((t) => !owned(t));

  const quick = (id, label, checked) => (
    <FormControlLabel label={label} control={<Switch size="small" checked={checked} onChange={(e) => setTools(toggle(tools, id, e.target.checked))} />} />
  );

  return (
    <Stack spacing={1.5}>
      <Stack sx={{ flexWrap: "wrap", columnGap: 2 }} direction="row">
        {quick(ALL_TOOLS, 'Everything (*)', everything)}
        {quick(ALL_BUILTIN, 'All built-in (@builtin)', tools.includes(ALL_BUILTIN))}
        {quick(ALL_MCP, 'All MCP (@mcp)', tools.includes(ALL_MCP))}
      </Stack>
      <Divider />
      <Typography variant="caption" color="text.secondary">Built-in tools</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
        {BUILTIN_SELECTORS.filter((b) => !b.subagents).map((b) => (
          <FormControlLabel key={b.id} sx={{ alignItems: 'flex-start', mr: 1 }}
            control={<Checkbox size="small" disabled={allBuiltin} checked={grantsBuiltin(tools, b.id)}
              onChange={(e) => setTools(toggle(tools, b.id, e.target.checked))} />}
            label={<Box sx={{ pt: 0.75 }}><Typography variant="body2">{b.label}</Typography>
              <Typography variant="caption" color="text.secondary">{b.detail}</Typography></Box>} />
        ))}
      </Box>
      <Typography variant="caption" color="text.secondary">Which agents it can start is set in the Sub-agents section.</Typography>
      {serverNames.length > 0 && (
        <>
          <Typography variant="caption" color="text.secondary">MCP servers</Typography>
          <Stack sx={{ flexWrap: "wrap", columnGap: 2 }} direction="row">
            {serverNames.map((s) => (
              <FormControlLabel key={s} label={`@${s}`} control={
                <Checkbox size="small" disabled={allMcp} checked={grantsServer(tools, s)}
                  onChange={(e) => setTools(toggle(tools, `@${s}`, e.target.checked))} />} />
            ))}
          </Stack>
        </>
      )}
      <ListInput label="Other selectors" value={others} options={[...BUILTIN_TOOLS.map((b) => b.id), ...mcpTools]} describe={describe}
        onChange={(next) => setTools([...tools.filter((t) => owned(t) || next.includes(t)), ...next.filter((t) => !tools.includes(t))])}
        placeholder="Pick a tool, or type @server/tool or a tool ID"
        helperText="Pick one built-in tool or one MCP tool, or type any name and press Enter. MCP tools appear once the server's tools have been listed." />
      <ListInput label="Never allow (excludedTools)" value={excluded} describe={describe}
        options={[...TOOL_TAGS, 'knowledge', 'invoke_sub_agent', ...BUILTIN_TOOLS.map((b) => b.id), ...serverNames.map((s) => `@${s}`), ...mcpTools]}
        onChange={(next) => onChange(setField(spec, 'excludedTools', next))}
        helperText="Never available to the agent, even if a setting above includes them. Pick one, or type any name and press Enter." />
      {unknown.map((u) => <Alert key={u.name} severity="warning">{u.hint}</Alert>)}
    </Stack>
  );
}
