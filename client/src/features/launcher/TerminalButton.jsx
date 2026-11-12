/**
 * @fileoverview The Terminal button shown next to Save: opens the launch
 * dialog for a Kiro CLI V3 chat, optionally with a specific agent.
 */
import { useState } from 'react';
import { Button, Tooltip } from '@mui/material';
import { Terminal } from '@mui/icons-material';
import { launchableAgentError } from '../../domain/launch.js';
import { LaunchDialog } from './LaunchDialog';
import { useKiroStatus, kiroBlocker } from '../../data/useKiro';

/**
 * @param {Object} props
 * @param {string} [props.agentId]
 * @param {string} [props.disabledReason] why launching is not possible right now.
 * @param {Object} [props.v3] 2.x: the agent's V3 readiness.
 * @param {string} [props.title] the dialog's title.
 * @param {React.ReactNode} [props.hint] what to do once the chat opens.
 * @param {'small'|'medium'} [props.size]
 * @param {string} [props.label] the button text when it does one thing (e.g. "Run with Kiro"); Terminal otherwise.
 * @param {string} [props.tip] the tooltip, when the title isn't the best one.
 */
export function TerminalButton({ agentId, disabledReason, v3, title, hint, size = 'medium', label = 'Terminal', tip: tipText }) {
  const [open, setOpen] = useState(false);
  const { data: status } = useKiroStatus();
  const reason = kiroBlocker(status, 'chat') || disabledReason || (agentId ? launchableAgentError(agentId) : '');
  const tip = reason || tipText || (agentId ? `Chat with ${agentId} in Kiro CLI` : 'Open Kiro CLI in a terminal');
  return (
    <>
      <Tooltip title={tip}>
        <span>
          <Button variant="outlined" size={size} startIcon={<Terminal />} disabled={!!reason} onClick={() => setOpen(true)}>
            {label}
          </Button>
        </span>
      </Tooltip>
      <LaunchDialog
        open={open} onClose={() => setOpen(false)} agentId={agentId} v3={v3} hint={hint}
        title={title || (agentId ? `Chat with ${agentId}` : 'Launch Kiro CLI')}
      />
    </>
  );
}
