/**
 * @fileoverview A row of small summary Cards showing top-level Kiro CLI
 * usage counters for the currently selected time range.
 */
import React from 'react';
import { Card, CardContent, Typography, Stack, Skeleton } from '@mui/material';

/** Convert a unix timestamp (seconds) into a compact local-time label. */
function formatTimestamp(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts * 1000).toLocaleString();
  } catch {
    return '—';
  }
}

/**
 * @param {Object} props
 * @param {?Object} props.summary - Summary payload from /api/performance/summary
 * @param {boolean} props.loading
 */
const SummaryCards = ({ summary, loading }) => {
  const cards = [
    { label: 'Sessions',           value: summary?.sessions ?? 0 },
    { label: 'User prompts', value: summary?.prompts ?? 0 },
    { label: 'Tool calls',   value: summary?.toolCalls ?? 0 },
    { label: 'First activity',     value: formatTimestamp(summary?.firstActivity), wide: true },
    { label: 'Last activity',      value: formatTimestamp(summary?.lastActivity),  wide: true },
  ];

  return (
    <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
      {cards.map((c) => (
        <Card key={c.label} sx={{ flex: c.wide ? '1 1 220px' : '1 1 140px', minWidth: c.wide ? 220 : 140 }}>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="caption" color="text.secondary">{c.label}</Typography>
            {loading ? (
              <Skeleton variant="text" width="60%" height={32} />
            ) : (
              <Typography variant="h6" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
                {typeof c.value === 'number' ? c.value.toLocaleString() : c.value}
              </Typography>
            )}
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
};

export default SummaryCards;
