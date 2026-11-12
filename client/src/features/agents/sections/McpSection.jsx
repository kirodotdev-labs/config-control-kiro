/**
 * @fileoverview The agent's own MCP servers, and whether it also gets the
 * servers from mcp.json. Servers from mcp.json can be copied in to customise
 * them for this agent.
 */
import { useState } from 'react';
import { Button, FormControlLabel, Menu, MenuItem, Stack, Switch, Typography } from '@mui/material';
import { ContentCopy } from '@mui/icons-material';
import { useMcpConfig } from '../../../data/useMcp';
import { serverEntries } from '../../../domain/mcp.js';
import { isObject, setField } from '../../../domain/json.js';
import { ServerList } from '../../mcp/ServerList';

/** @param {{spec: Object, onChange: (next: Object) => void}} props */
export function McpSection({ spec, onChange }) {
  const [anchor, setAnchor] = useState(null);
  const shared = serverEntries(useMcpConfig().data?.config?.mcpServers);
  const own = isObject(spec.mcpServers) ? spec.mcpServers : {};
  const copyable = shared.filter(([name]) => !(name in own));
  const setServers = (next) => onChange(setField(spec, 'mcpServers', next, { keepEmpty: 'mcpServers' in spec }));

  return (
    <Stack spacing={1.5}>
      <FormControlLabel
        control={<Switch size="small" checked={spec.includeMcpJson === true}
          onChange={(e) => onChange(setField(spec, 'includeMcpJson', e.target.checked || undefined))} />}
        label={<Typography variant="body2">Also use the servers in mcp.json ({shared.length})</Typography>}
      />
      <ServerList
        servers={own} onChange={setServers}
        extraActions={copyable.length > 0 && (
          <>
            <Button startIcon={<ContentCopy />} onClick={(e) => setAnchor(e.currentTarget)}>Copy from mcp.json</Button>
            <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
              {copyable.map(([name, cfg]) => (
                <MenuItem key={name} onClick={() => { setServers({ ...own, [name]: cfg }); setAnchor(null); }}>{name}</MenuItem>
              ))}
            </Menu>
          </>
        )}
      />
    </Stack>
  );
}
