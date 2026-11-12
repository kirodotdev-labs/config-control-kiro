/**
 * @fileoverview A chat's tags: chips that filter the list when clicked, and
 * an editor that adds or removes tags, suggesting ones already in use. Tags
 * are the app's own labels; Kiro's chat is never changed.
 */
import { useState } from 'react';
import { Autocomplete, Box, Button, Chip, Popover, Stack, TextField, Typography } from '@mui/material';
import { LocalOffer } from '@mui/icons-material';
import { useChatActions } from '../../data/useSessions';
import { errorMessage } from '../../data/errors';
import { normalizeTag } from '../../domain/sessions.js';
import { useNotify } from '../../ui/NotifyProvider';

/**
 * @param {Object} props
 * @param {Object} props.chat
 * @param {string[]} props.known every tag in use, for suggestions.
 * @param {(tag: string) => void} props.onPick filters the list by a tag.
 */
export function ChatTags({ chat, known, onPick }) {
  const { setTags } = useChatActions();
  const notify = useNotify();
  const [anchor, setAnchor] = useState(null);
  const [draft, setDraft] = useState([]);
  const tags = chat.tags || [];

  const open = (e) => { setDraft(tags); setAnchor(e.currentTarget); };
  const save = () => {
    const next = [...new Set(draft.map(normalizeTag).filter(Boolean))];
    setAnchor(null);
    if (next.join() === tags.join()) return;
    setTags.mutate({ id: chat.id, tags: next }, { onError: (e) => notify(errorMessage(e), 'error') });
  };

  return (
    <>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
        {tags.map((t) => (
          <Chip key={t} size="small" color="secondary" variant="outlined" label={`#${t}`} onClick={() => onPick(t)}
            title={`Show chats tagged #${t}`} sx={{ height: 20, fontSize: 11 }} />
        ))}
        <Button size="small" onClick={open} startIcon={<LocalOffer sx={{ fontSize: '14px !important' }} />}
          aria-label={`Edit tags for ${chat.title || 'this chat'}`} sx={{ minWidth: 0, py: 0, fontSize: 11, color: 'text.secondary' }}>
          {tags.length ? 'Edit' : 'Add tag'}
        </Button>
      </Stack>
      <Popover open={!!anchor} anchorEl={anchor} onClose={save} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <Box sx={{ p: 2, width: 360 }}>
          <Typography variant="subtitle2">Tags for this chat</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Type a tag and press Enter. Search with #tag. Tags are kept by this app; Kiro&apos;s chat isn&apos;t changed.
          </Typography>
          <Autocomplete multiple freeSolo autoHighlight size="small" options={known.filter((t) => !draft.includes(t))} value={draft}
            onChange={(_, v) => setDraft([...new Set(v.map(normalizeTag).filter(Boolean))])}
            renderValue={(value, getItemProps) => value.map((t, i) => {
              const { key, ...rest } = getItemProps({ index: i });
              return <Chip key={key} size="small" label={`#${t}`} {...rest} />;
            })}
            renderInput={(params) => <TextField {...params} autoFocus placeholder={draft.length ? '' : 'e.g. client-x'} />} />
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', mt: 1.5 }}>
            <Button onClick={() => setAnchor(null)}>Cancel</Button>
            <Button variant="contained" onClick={save}>Save</Button>
          </Stack>
        </Box>
      </Popover>
    </>
  );
}
