/**
 * @fileoverview The MCP servers of mcp.json or of an agent: one row per
 * server, plus adding and removing. Edits go back as a new servers map with
 * the original order kept.
 */
import { useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { Add } from '@mui/icons-material';
import { serverEntries } from '../../domain/mcp.js';
import { useConfirm } from '../../ui/ConfirmProvider';
import { ServerRow } from './ServerRow';
import { AddServerDialog } from './AddServerDialog';

/**
 * @param {Object} props
 * @param {Object} props.servers name -> config.
 * @param {(next: Object) => void} props.onChange
 * @param {(name: string) => void} [props.onFocusServer]
 * @param {React.ReactNode} [props.extraActions] buttons next to "Add server".
 * @param {string} [props.openServer] server to show expanded.
 * @param {{name: string, n: number}} [props.reveal] open and scroll to a server (from the JSON pane).
 * @param {string} [props.activeServer] the server highlighted in the JSON.
 */
export function ServerList({ servers, onChange, onFocusServer, extraActions, openServer, reveal, activeServer }) {
  const [adding, setAdding] = useState(false);
  const confirm = useConfirm();
  const entries = serverEntries(servers);

  const update = (name, cfg) => onChange({ ...servers, [name]: cfg });
  const remove = async (name) => {
    if (!await confirm({ title: `Remove ${name}?`, body: 'It disappears from the list now and is deleted from the file when you save.', confirmLabel: 'Remove', danger: true })) return;
    const { [name]: _gone, ...rest } = servers;
    onChange(rest);
  };

  return (
    <Stack spacing={1}>
      {entries.map(([name, cfg]) => (
        <ServerRow key={name} name={name} cfg={cfg} initiallyOpen={name === openServer} onChange={(next) => update(name, next)}
          onRemove={() => remove(name)} onFocus={() => onFocusServer?.(name)} reveal={reveal?.name === name ? reveal.n : 0} active={activeServer === name} />
      ))}
      {!entries.length && <Typography variant="body2" color="text.secondary">No servers yet.</Typography>}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button startIcon={<Add />} onClick={() => setAdding(true)}>Add server</Button>
        {extraActions}
      </Box>
      <AddServerDialog open={adding} onClose={() => setAdding(false)} existing={entries.map(([n]) => n)}
        onAdd={(added) => onChange({ ...servers, ...added })} />
    </Stack>
  );
}
