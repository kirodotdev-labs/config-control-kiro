/**
 * @fileoverview Above a prompt's text: how to run it in a chat, and an
 * Arguments bar that shows the placeholders the file uses and inserts one at
 * the cursor.
 */
import { useState } from 'react';
import { Box, Button, Chip, Menu, MenuItem, Stack, Typography } from '@mui/material';
import { Add } from '@mui/icons-material';
import { placeholderOptions, promptPlaceholders, promptUsage } from '../../domain/prompts.js';
import { SURFACE } from '../../theme';

/**
 * @param {Object} props
 * @param {string} props.text the prompt file.
 * @param {string} props.fileName e.g. review.md.
 * @param {(token: string) => void} props.onInsert put a placeholder at the cursor.
 */
export function PromptForm({ text, fileName, onInsert }) {
  const used = promptPlaceholders(text);
  const [menu, setMenu] = useState(null);
  const chips = [...(used.all ? ['$ARGUMENTS'] : []), ...used.positions.map((n) => `$${n}`)];
  return (
    <Box sx={{ p: 2, borderBottom: `1px solid ${SURFACE.border}`, display: 'flex', flexDirection: 'column', gap: 1 }} data-section="prompt">
      <Typography variant="body2">
        Run it in a chat: <Box component="code" sx={{ fontWeight: 700 }}>{promptUsage(fileName, used)}</Box>
      </Typography>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
        <Typography variant="body2" color="text.secondary">Arguments</Typography>
        {chips.map((c) => <Chip key={c} size="small" variant="outlined" label={c} sx={{ fontFamily: 'monospace' }} title={c === '$ARGUMENTS' ? 'Everything typed after the name' : `Word ${c.slice(1)} typed after the name`} />)}
        {!chips.length && <Typography variant="body2" color="text.secondary">none: the prompt runs the same way every time</Typography>}
        <Button size="small" startIcon={<Add />} onClick={(e) => setMenu(e.currentTarget)}>Insert</Button>
        <Menu open={!!menu} anchorEl={menu} onClose={() => setMenu(null)} disableRestoreFocus>{/* focus goes back to the text, not the button */}
          {placeholderOptions(used).map((o) => (
            <MenuItem key={o.token} onClick={() => { setMenu(null); onInsert(o.token); }}>
              <Box component="span" sx={{ fontFamily: 'monospace', mr: 1 }}>{o.token}</Box>
              <Typography component="span" variant="body2" color="text.secondary">{o.label}</Typography>
            </MenuItem>
          ))}
        </Menu>
      </Stack>
    </Box>
  );
}
