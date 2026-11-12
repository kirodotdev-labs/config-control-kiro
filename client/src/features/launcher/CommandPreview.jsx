/**
 * @fileoverview A copyable command line.
 */
import { useState } from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import { Check, ContentCopy } from '@mui/icons-material';

/** @param {{label?: string, command: string}} props */
export function CommandPreview({ label, command }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, px: 1.5, py: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        {label && <Typography variant="caption" color="text.secondary">{label}</Typography>}
        <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{command}</Typography>
      </Box>
      <Tooltip title={copied ? 'Copied' : 'Copy'}>
        <IconButton size="small" onClick={copy} aria-label="Copy command">
          {copied ? <Check fontSize="small" color="success" /> : <ContentCopy fontSize="small" />}
        </IconButton>
      </Tooltip>
    </Box>
  );
}
