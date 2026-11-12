/**
 * @fileoverview The Chats tab: counters and engine chips that filter,
 * search (with #tag), agent, Workspace and tag filters, empty chats hidden
 * by default with a way to delete them through Kiro, and the list.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, FormControlLabel, InputAdornment, MenuItem, Stack, Switch, TextField, Typography,
} from '@mui/material';
import { Search } from '@mui/icons-material';
import {
  DEFAULT_AGENT, ENGINES, agentLabel, chatCounts, childrenByParent, filterChats, nestChats, tagCounts, withSubagentLinks,
} from '../../domain/sessions.js';
import { EmptyState } from '../../ui/States';
import { ChatRow } from './ChatRow';
import { ManageTagsDialog } from './ManageTagsDialog';
import { useDeleteChat } from './useDeleteChat';
import { DeleteEmptyV2Chats } from '../v2/DeleteEmptyV2Chats';
import { useResume } from './useResume';

const PAGE = 150;

/**
 * @param {Object} props
 * @param {Object[]} props.sessions
 * @param {{name: string, path: string}[]} props.workspaces
 * @param {boolean} props.global whether to offer the folder filter.
 * @param {Set<string>} props.agentIds
 * @param {(id: string) => void} [props.onOpenAgent]
 */
export function ChatList({ sessions, workspaces, global, agentIds, onOpenAgent }) {
  const [query, setQuery] = useState('');
  const [show, setShow] = useState('all');
  const [engine, setEngine] = useState('');
  const [agent, setAgent] = useState('');
  const [folder, setFolder] = useState('');
  const [tag, setTag] = useState('');
  const [subagents, setSubagents] = useState(false);
  const [emptyOnly, setEmptyOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [manage, setManage] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());
  const listRef = useRef(null);
  const resumer = useResume();
  // The empty view ends by itself once no empty chats are left (e.g. after deleting them).
  const emptyView = emptyOnly && sessions.some((s) => s.empty && !s.parentId);
  const counts = chatCounts(sessions, { emptyOnly: emptyView });
  const tags = useMemo(() => tagCounts(sessions), [sessions]);
  const known = tags.map((t) => t.tag);
  const kiroOnlyTags = useMemo(() => [...new Set(sessions.flatMap((s) => s.kiroTags || []))].filter((t) => !known.includes(t)).sort(), [sessions, known]);
  const agents = useMemo(() => [...new Set(sessions.map((s) => s.agent || DEFAULT_AGENT))].sort(), [sessions]);
  const children = useMemo(() => childrenByParent(sessions), [sessions]);
  const subView = subagents && counts.subagents > 0;
  const filtered = filterChats(sessions, { query, show, agent, folder, subagents: subView, engine, tag, emptyOnly: emptyView });
  const shown = subView ? withSubagentLinks(filtered, children) : filtered;
  const byId = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions]);
  const rows = nestChats(shown, children, { allChildren: subView, expanded });
  const toggleChildren = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Turning subagent chats on scrolls to the first one, so the change is visible.
  useEffect(() => {
    if (!subagents) return;
    const first = listRef.current?.querySelector('[data-depth="1"]');
    first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [subagents]);

  const { onDelete, deleting } = useDeleteChat(children);
  const reset = () => setLimit(PAGE);

  const counter = (id, label, n, color) => (
    <Chip label={`${label} ${n}`} color={show === id ? color : 'default'} variant={show === id ? 'filled' : 'outlined'}
      onClick={() => { setShow(show === id && id !== 'all' ? 'all' : id); reset(); }} />
  );
  const engineChip = (id, label, n) => (
    <Chip key={id || 'any'} size="small" label={n == null ? label : `${label} ${n}`}
      color={engine === id ? 'primary' : 'default'} variant={engine === id ? 'filled' : 'outlined'}
      onClick={() => { setEngine(engine === id ? '' : id); reset(); }} />
  );

  const v3Empties = sessions.filter((s) => s.empty && !s.parentId && !s.running && s.engine === 'v3');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        {counter('all', 'All chats', counts.all, 'primary')}
        {counter('running', 'Running now', counts.running, 'success')}
        {counter('full', 'Nearly full', counts.full, 'warning')}
        {counts.bookmarked > 0 && counter('bookmarked', 'Bookmarked', counts.bookmarked, 'secondary')}
        {counts.branches > 0 && counter('branches', 'Tangents and rewinds', counts.branches, 'secondary')}
        <Box sx={{ width: 12 }} />
        <Typography variant="caption" color="text.secondary">Engine</Typography>
        {engineChip('', 'All')}
        {ENGINES.map((e) => engineChip(e.id, e.label, counts.engines[e.id] || 0))}
      </Stack>
      <Stack direction="row" spacing={1.5} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField size="small" sx={{ flex: '1 1 260px' }} placeholder="Search chats, or #tag" value={query}
          onChange={(e) => { setQuery(e.target.value); reset(); }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> } }} />
        <TextField select size="small" label="Agent" value={agent} onChange={(e) => setAgent(e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="">Any agent</MenuItem>
          {agents.map((a) => <MenuItem key={a} value={a}>{agentLabel(a)}</MenuItem>)}
        </TextField>
        {global && workspaces.length > 0 && (
          <TextField select size="small" label="Workspace" value={folder} onChange={(e) => setFolder(e.target.value)} sx={{ minWidth: 160 }}>
            <MenuItem value="">Anywhere</MenuItem>
            {workspaces.map((w) => <MenuItem key={w.path} value={w.path}>{w.name}</MenuItem>)}
          </TextField>
        )}
        <TextField select size="small" label="Tag" value={tag} onChange={(e) => { setTag(e.target.value); reset(); }} sx={{ minWidth: 150 }}>
          <MenuItem value="">Any tag</MenuItem>
          {tags.map((t) => <MenuItem key={t.tag} value={t.tag}>#{t.tag} ({t.count})</MenuItem>)}
          {kiroOnlyTags.map((t) => <MenuItem key={`k-${t}`} value={t}>#{t} (from Kiro)</MenuItem>)}
          {!tags.length && !kiroOnlyTags.length && <MenuItem disabled value="none">No tags yet</MenuItem>}
        </TextField>
        <Button size="small" disabled={!tags.length} onClick={() => setManage(true)}>Manage tags</Button>
      </Stack>
      <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        {counts.subagents > 0 && (
          <FormControlLabel label={`Only subagent chats (${counts.subagents})`}
            control={<Switch size="small" checked={subView} onChange={(e) => { setSubagents(e.target.checked); if (e.target.checked) setEmptyOnly(false); reset(); }} />} />
        )}
        {counts.empty > 0 && (
          <FormControlLabel label={`Only empty chats (${counts.empty})`}
            control={<Switch size="small" checked={emptyView} onChange={(e) => { setEmptyOnly(e.target.checked); if (e.target.checked) setSubagents(false); reset(); }} />} />
        )}
        {emptyView && v3Empties.length > 0 && (
          <Button size="small" variant="outlined" disabled={resumer.pending}
            onClick={() => resumer.dashboard(v3Empties[0].folder, "Highlight a workspace's more row and press Ctrl+D to review its empty sessions, Ctrl+D again, then y.")}>
            {`Clean up ${v3Empties.length} empty V3 chat${v3Empties.length === 1 ? '' : 's'} in Kiro…`}
          </Button>
        )}
        {/* 2.x: remove with V2 support */}
        {emptyView && <DeleteEmptyV2Chats sessions={sessions} workspaces={workspaces} />}
      </Stack>
      {tag && (
        <Alert severity="info" action={<Button color="inherit" onClick={() => setTag('')}>Show all</Button>}>Showing chats tagged #{tag}.</Alert>
      )}
      {show === 'branches' && (
        <Typography variant="caption" color="text.secondary">
          Tangents (/tangent) and rewinds (/rewind) are side conversations branched from another chat. Each is a chat of its own, with its
          own credits. Resume one to continue it; inside a chat, /tangent ls shows the whole tree.
        </Typography>
      )}
      {show === 'bookmarked' && (
        <Typography variant="caption" color="text.secondary">Chats you bookmarked in Kiro&apos;s session dashboard (/sessions).</Typography>
      )}
      {emptyView && (
        <Typography variant="caption" color="text.secondary">
          Showing only empty chats: Kiro saved them, but no message was ever sent in them. Turn the switch off to see every chat again.
        </Typography>
      )}
      {subView && (
        <Typography variant="caption" color="text.secondary">
          Showing only chats that used subagents, each with its subagent chats indented under it. Their credits are already part of
          that chat&apos;s total. Turn the switch off to see every chat again.
        </Typography>
      )}
      {rows.length === 0 ? (
        <EmptyState title={sessions.length ? 'No chats match' : 'No Kiro CLI chats yet'}
          body={sessions.length ? 'Clear the search or filters to see more.' : 'Chats appear here once you talk to Kiro in a terminal. Use the Terminal button on an agent to start one.'} />
      ) : (
        <Box ref={listRef} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }} role="list" aria-label="Kiro chats">
          {rows.slice(0, limit).map(({ chat: c, depth }) => (
            <ChatRow key={c.id} chat={c} depth={depth} workspaces={workspaces} resumer={resumer} onOpenAgent={onOpenAgent} agentIds={agentIds}
              knownTags={known} onPickTag={(t) => { setTag(t); reset(); }}
              parentTitle={c.parentId ? (byId.get(c.parentId)?.title || 'a chat that is no longer listed') : ''}
              branchTitle={c.branchOf ? (byId.get(c.branchOf)?.title || 'a chat that is no longer listed') : ''}
              childCount={subView ? 0 : (children.get(c.id) || []).length} expanded={expanded.has(c.id)}
              onToggleChildren={() => toggleChildren(c.id)} onDelete={onDelete} deleting={deleting} />
          ))}
        </Box>
      )}
      {rows.length > limit && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Button onClick={() => setLimit(limit + PAGE)}>Show more</Button>
          <Typography variant="caption" color="text.secondary">Showing {limit} of {rows.length}</Typography>
        </Stack>
      )}
      <ManageTagsDialog open={manage} onClose={() => setManage(false)} tags={tags} />
    </Box>
  );
}
