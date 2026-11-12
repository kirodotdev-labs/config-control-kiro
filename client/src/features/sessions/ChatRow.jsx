/**
 * @fileoverview One Kiro chat: status, title, where and with what it ran,
 * how full its context is, the credits it used, and Resume.
 */
import { Box, Button, Chip, IconButton, LinearProgress, Stack, Tooltip, Typography } from '@mui/material';
import { Bookmark, CallSplit, ContentCopy, DeleteOutlined, ExpandLess, ExpandMore, PlayArrow, SubdirectoryArrowRight } from '@mui/icons-material';
import { FULL_CONTEXT, agentLabel, deleteBlocker, deletedInKiro, folderLabel, formatCredits, timeAgo } from '../../domain/sessions.js';
import { useNotify } from '../../ui/NotifyProvider';
import { ChatTags } from './ChatTags';
import { SURFACE } from '../../theme';

const ENGINE = {
  v3: 'Kiro CLI V3 chat',
  v2: 'Kiro CLI 2.x chat. Resuming it uses the 2.x engine (--v2).',
  classic: 'Older classic chat. Resuming it uses the legacy harness (--legacy-ui).',
};

/**
 * @param {Object} props
 * @param {Object} props.chat
 * @param {{name: string, path: string}[]} props.workspaces
 * @param {ReturnType<import('./useResume').useResume>} props.resumer
 * @param {(id: string) => void} [props.onOpenAgent]
 * @param {Set<string>} props.agentIds agents defined in this scope.
 * @param {string[]} props.knownTags every tag in use.
 * @param {(tag: string) => void} props.onPickTag
 * @param {number} [props.depth] 1+ for a subagent chat shown under its parent.
 * @param {string} [props.parentTitle] title of the chat that started this one.
 * @param {string} [props.branchTitle] title of the chat a tangent or rewind branched from.
 * @param {number} [props.childCount] subagent chats this chat started.
 * @param {boolean} [props.expanded] whether those are shown under it.
 * @param {() => void} [props.onToggleChildren]
 * @param {(chat: Object) => void} props.onDelete
 * @param {boolean} [props.deleting]
 */
export function ChatRow({
  chat, workspaces, resumer, onOpenAgent, agentIds, knownTags, onPickTag,
  depth = 0, parentTitle, branchTitle, childCount = 0, expanded = false, onToggleChildren, onDelete, deleting = false,
}) {
  const notify = useNotify();
  const where = folderLabel(chat.folder, workspaces);
  const ctx = chat.contextPct;
  const full = (ctx ?? 0) >= FULL_CONTEXT;
  const copy = async () => {
    await navigator.clipboard.writeText(resumer.copyText(chat));
    notify('Command copied. Paste it in a terminal.', 'success');
  };
  const agent = chat.agent ? agentLabel(chat.agent) : '';
  return (
    <Stack direction="row" spacing={1.5} data-chat-id={chat.id} data-depth={depth}
      sx={{ alignItems: 'center', px: 1.5, py: 1, pl: 1.5 + depth * 3.5, borderBottom: `1px solid ${SURFACE.border}`,
        bgcolor: depth ? 'rgba(123, 97, 255, 0.05)' : undefined, '&:hover': { bgcolor: 'action.hover' } }}>
      {depth > 0 && <SubdirectoryArrowRight sx={{ fontSize: 16, color: 'text.secondary', ml: -2.5 }} />}
      <Tooltip title={chat.running ? 'Kiro is working in this chat now' : 'Not running'}>
        <Box sx={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, bgcolor: chat.running ? 'success.main' : 'transparent',
          border: chat.running ? 'none' : `1px solid ${SURFACE.border}`,
          animation: chat.running ? 'cckPulse 1.6s ease-in-out infinite' : 'none',
          '@keyframes cckPulse': { '50%': { opacity: 0.35 } } }} />
      </Tooltip>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        {chat.empty
          ? <Typography variant="body2" noWrap sx={{ fontStyle: 'italic', color: 'text.secondary' }} title="Kiro saved this chat but no message was ever sent in it">Empty chat, nothing was said</Typography>
          : (
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', minWidth: 0 }}>
              {chat.bookmarked && (
                <Tooltip title="Bookmarked in Kiro's session dashboard (/sessions). Bookmark, rename and tag chats there.">
                  <Bookmark sx={{ fontSize: 16, color: 'secondary.light' }} aria-label="Bookmarked in Kiro" />
                </Tooltip>
              )}
              <Typography variant="body2" noWrap title={chat.title} sx={{ fontWeight: chat.running ? 700 : 500 }}>{chat.title || 'Untitled chat'}</Typography>
            </Stack>
          )}
        {parentTitle && (
          <Typography variant="caption" color="secondary.light" noWrap sx={{ display: 'block' }} title={parentTitle}>Subagent of: {parentTitle}</Typography>
        )}
        {branchTitle && (
          <Tooltip title={chat.kind === 'tangent'
            ? 'A /tangent side conversation: it started with that chat\'s history and continues on its own.'
            : 'Made with /rewind: a new chat from an earlier turn of that chat, which is unchanged.'}>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', color: 'secondary.light' }}>
              <CallSplit sx={{ fontSize: 14 }} />
              <Typography variant="caption" noWrap>{chat.kind === 'tangent' ? 'Tangent of' : 'Rewound from'}: {branchTitle}</Typography>
            </Stack>
          </Tooltip>
        )}
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center',  color: 'text.secondary', minWidth: 0 }}>
          <Typography variant="caption" noWrap title={chat.folder} sx={{ color: where.workspace ? 'primary.light' : 'text.secondary' }}>{where.label}</Typography>
          {agent && <Typography variant="caption">·</Typography>}
          {agent && (agentIds.has(chat.agent) && onOpenAgent
            ? <Typography variant="caption" component="button" onClick={() => onOpenAgent(chat.agent)}
                sx={{ border: 0, p: 0, background: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer', textDecoration: 'underline dotted' }} title="Open this agent">{agent}</Typography>
            : <Typography variant="caption" noWrap>{agent}</Typography>)}
          {chat.model && <Typography variant="caption" noWrap>· {chat.model}{chat.rateMultiplier > 1 ? ` (${chat.rateMultiplier}x)` : ''}</Typography>}
          <Typography variant="caption" noWrap>· {timeAgo(chat.updatedAt)}</Typography>
          <Tooltip title={ENGINE[chat.engine] || chat.engine}>
            <Chip size="small" variant="outlined" label={chat.engine} sx={{ height: 18, fontSize: 10 }} />
          </Tooltip>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <ChatTags chat={chat} known={knownTags} onPick={onPickTag} />
          {(chat.kiroTags || []).filter((t) => !(chat.tags || []).includes(t)).map((t) => (
            <Tooltip key={t} title="A tag from Kiro's session dashboard (/sessions). Change it there.">
              <Chip size="small" variant="outlined" label={`#${t}`} onClick={() => onPickTag(t)} sx={{ height: 20, borderStyle: 'dashed' }} />
            </Tooltip>
          ))}
          {childCount > 0 && onToggleChildren && (
            <Button size="small" onClick={onToggleChildren} startIcon={expanded ? <ExpandLess /> : <ExpandMore />}
              sx={{ minWidth: 0, py: 0, fontSize: 11 }}>
              {expanded ? 'Hide' : 'Show'} {childCount} subagent chat{childCount === 1 ? '' : 's'}
            </Button>
          )}
        </Stack>
      </Box>
      <Tooltip title={ctx == null ? 'Kiro didn\'t record context use for this chat' : `${ctx.toFixed(0)}% of the context window in use${full ? '. Nearly full: a fresh chat would cost less per turn.' : ''}`}>
        <Box sx={{ width: 90, flexShrink: 0 }}>
          <Typography variant="caption" color={full ? 'warning.main' : 'text.secondary'}>{ctx == null ? '—' : `${ctx.toFixed(0)}% context`}</Typography>
          <LinearProgress variant="determinate" value={Math.min(100, ctx ?? 0)} color={full ? 'warning' : 'primary'} sx={{ height: 4, borderRadius: 2 }} />
        </Box>
      </Tooltip>
      <Tooltip title={chat.credits == null ? 'Kiro doesn\'t save credits for this kind of chat where the app can read them'
        : `${formatCredits(chat.credits)} credits${chat.subagents ? `, including ${chat.subagents} subagent chat${chat.subagents > 1 ? 's' : ''}` : ''}`}>
        <Typography variant="body2" sx={{ width: 84, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {chat.credits == null ? '—' : `${formatCredits(chat.credits)} cr`}
        </Typography>
      </Tooltip>
      <Tooltip title={!chat.resumeCommand ? 'This chat id can\'t be passed to a terminal command' : chat.running ? 'This chat is open in a terminal now' : 'Open this chat in a new terminal'}>
        <span>
          <Button size="small" variant="outlined" startIcon={<PlayArrow />} disabled={!chat.resumeCommand || chat.running || resumer.pending}
            onClick={() => resumer.resume(chat)}>Resume</Button>
        </span>
      </Tooltip>
      <Tooltip title="Copy the resume command">
        <span><IconButton size="small" disabled={!chat.resumeCommand} onClick={copy} aria-label={`Copy resume command for ${chat.title}`}><ContentCopy fontSize="small" /></IconButton></span>
      </Tooltip>
      <Tooltip title={deleteBlocker(chat) || (deletedInKiro(chat) ? "Delete it in Kiro's session dashboard: opens it in a new terminal" : 'Delete this chat')}>
        <span>
          <IconButton size="small" disabled={!!deleteBlocker(chat) || deleting} onClick={() => onDelete(chat)}
            aria-label={`Delete chat ${chat.empty ? 'empty chat' : chat.title}`}><DeleteOutlined fontSize="small" /></IconButton>
        </span>
      </Tooltip>
    </Stack>
  );
}
