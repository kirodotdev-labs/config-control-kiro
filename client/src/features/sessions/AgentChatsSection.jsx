/**
 * @fileoverview An agent's Chats & usage: how its context fills up before
 * you type, its credits over the last 30 days with suggestions, and its own
 * chats.
 */
import { Alert, Divider, Stack, Typography } from '@mui/material';
import { agentAdvice, formatCredits } from '../../domain/sessions.js';
import { AgentContext } from './AgentContext';
import { AgentChats } from './AgentChats';

/**
 * @param {Object} props
 * @param {ReturnType<import('./useAgentContext').useAgentContext>} props.context
 * @param {{usage: Object|undefined, running: number, sessions: Object[]|undefined, problem: Object|undefined}} props.chats from useAgentUsage.
 * @param {string[]} props.names the agent's id and name field.
 * @param {string} props.blocker why chats can't be listed, or ''.
 * @param {() => void} [props.onOpenChats]
 */
export function AgentChatsSection({ context, chats, names, blocker, onOpenChats }) {
  const { usage, running, sessions, problem } = chats;
  const advice = agentAdvice(usage);
  const unavailable = blocker || (problem && `${problem.message} ${problem.fix}`);
  return (
    <Stack spacing={2}>
      <Stack spacing={1}>
        <Typography variant="overline" color="text.secondary">Context</Typography>
        <AgentContext context={context} />
      </Stack>
      <Divider />
      <Stack spacing={1.25}>
        <Typography variant="overline" color="text.secondary">Usage in the last 30 days</Typography>
        {unavailable && <Typography variant="body2" color="text.secondary">{unavailable}</Typography>}
        {!unavailable && running > 0 && (
          <Alert severity="info">
            {running} Kiro chat{running > 1 ? 's are' : ' is'} running with this agent now. A chat keeps the version of the agent it started with,
            so changes you save here apply to new chats, or after you quit and resume that chat.
          </Alert>
        )}
        {!unavailable && (!usage || !usage.chats) && (
          <Typography variant="body2" color="text.secondary">
            No credits recorded for this agent in the last 30 days. Start a chat with the Terminal button to use it.
          </Typography>
        )}
        {!unavailable && usage?.chats > 0 && (
          <>
            <Typography variant="body2">
              {formatCredits(usage.credits)} credits in {usage.chats} chat{usage.chats === 1 ? '' : 's'} ({usage.turns} turns).
              Chats used {usage.avgContextPct.toFixed(0)}% of the context window on average. Most credits went to {usage.mainModel}
              {usage.mainRate > 1 ? ` (${usage.mainRate}x credits)` : ''}.
            </Typography>
            {advice.map((a) => (
              <Alert key={a.id} severity="warning" variant="outlined">
                {a.text} {a.where === 'model' ? 'Change it in the Model section above.' : 'See Global → Settings → Compaction.'}
              </Alert>
            ))}
          </>
        )}
      </Stack>
      {!unavailable && sessions && (
        <>
          <Divider />
          <Stack spacing={1}>
            <Typography variant="overline" color="text.secondary">Chats</Typography>
            <AgentChats sessions={sessions} names={names} onOpenChats={onOpenChats} />
          </Stack>
        </>
      )}
    </Stack>
  );
}
