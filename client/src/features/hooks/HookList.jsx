/**
 * @fileoverview Edits a V3 hook array (inline agent hooks or a standalone hook
 * file's "hooks"). Order is kept; new hooks go to the end.
 */
import { Box, Button, Stack, Typography } from '@mui/material';
import { Add } from '@mui/icons-material';
import { newHook } from '../../domain/hooks.js';
import { RUNTIME_TOOL_IDS, TOOL_TAGS } from '../../domain/kiroTools.js';
import { HookRow } from './HookRow';

/**
 * @param {Object} props
 * @param {Object[]} props.hooks
 * @param {(next: Object[]) => void} props.onChange
 * @param {string[]} [props.serverNames] MCP servers, offered as @server matchers.
 * @param {(index: number) => void} [props.onFocus] a hook was clicked.
 * @param {number} [props.active] index of the hook the JSON pane shows.
 * @param {{index: number, n: number}} [props.reveal] scroll to a hook (from the JSON pane).
 */
export function HookList({ hooks, onChange, serverNames = [], onFocus, active = -1, reveal }) {
  const toolMatchers = [...TOOL_TAGS, '@builtin', '@mcp', ...serverNames.map((s) => `@${s}`), ...RUNTIME_TOOL_IDS];
  return (
    <Stack spacing={1.5}>
      {hooks.map((hook, i) => (
        <HookRow
          key={i} hook={hook} toolMatchers={toolMatchers} onFocus={onFocus && (() => onFocus(i))} active={active === i} reveal={reveal?.index === i ? reveal.n : 0}
          onChange={(next) => onChange(hooks.map((h, j) => (j === i ? next : h)))}
          onRemove={() => onChange(hooks.filter((_, j) => j !== i))}
        />
      ))}
      {!hooks.length && <Typography variant="body2" color="text.secondary">No hooks yet.</Typography>}
      <Box><Button startIcon={<Add />} onClick={() => onChange([...hooks, newHook(hooks)])}>Add hook</Button></Box>
    </Stack>
  );
}
