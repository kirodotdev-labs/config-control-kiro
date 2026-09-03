/**
 * @fileoverview Performance section embedded in the Dashboard: Kiro CLI
 * usage summary and per-turn model routing share, sourced from local
 * session logs plus the /usage command.
 */
import React from 'react';
import {
  Box,
  Typography,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Button,
  Alert,
  CircularProgress,
  Card,
  CardContent,
} from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import { useQuery, useQueryClient } from 'react-query';
import { getPerformanceSummary, getKiroUsage } from '../../services/api';
import usePersistedState from '../../hooks/usePersistedState';
import SummaryCards from './SummaryCards';
import PlanUsageCard from './PlanUsageCard';
import ModelUsageChart from './ModelUsageChart';
import { RAINBOW_COLORS, RAINBOW_GRADIENT_ID } from './colors';

const WINDOWS = [
  { value: '24h', label: 'Last 24h' },
  { value: '7d',  label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
];

const PerformanceSection = () => {
  const [range, setRange] = usePersistedState('performance.timeRange', '24h');
  const queryClient = useQueryClient();

  // Local session-log summary. No polling — it loads on mount, on range
  // change, and when the user clicks Refresh.
  const summaryQuery = useQuery(
    ['performance-summary', range],
    () => getPerformanceSummary(range),
  );

  // Plan usage fetches live from kiro-cli (slow, no caching). Fetch once on
  // load; no polling. On failure the card shows guidance and the user clicks
  // Refresh to try again.
  const usageQuery = useQuery(
    ['kiro-usage'],
    () => getKiroUsage(),
    { retry: false, refetchOnWindowFocus: false, staleTime: Infinity },
  );

  const handleRangeChange = (_e, next) => {
    if (next) setRange(next);
  };

  const handleRefresh = () => {
    // Refresh the whole section on demand: local summary + live plan usage.
    // Errors stay isolated per query (a usage failure only affects its card).
    queryClient.invalidateQueries(['performance-summary', range]);
    queryClient.invalidateQueries(['kiro-usage']);
  };

  const refreshing = summaryQuery.isFetching || usageQuery.isFetching;

  const summary = summaryQuery.data;
  const error = summaryQuery.error;
  const isLoading = summaryQuery.isLoading;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" spacing={2}>
        <Typography variant="h6">
          Performance
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <ToggleButtonGroup
            value={range}
            exclusive
            size="small"
            onChange={handleRangeChange}
            aria-label="time range"
          >
            {WINDOWS.map((w) => (
              <ToggleButton key={w.value} value={w.value} sx={{ textTransform: 'none' }}>
                {w.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          {summaryQuery.dataUpdatedAt > 0 && (
            <Typography variant="caption" color="text.secondary">
              Updated {new Date(summaryQuery.dataUpdatedAt).toLocaleString()}
            </Typography>
          )}
          {/* Gradient definition used to paint the refresh spinner. */}
          <Box component="svg" aria-hidden width={0} height={0} sx={{ position: 'absolute' }}>
            <defs>
              <linearGradient id={RAINBOW_GRADIENT_ID} x1="0%" y1="0%" x2="100%" y2="100%">
                {RAINBOW_COLORS.map((c, i) => (
                  <stop key={c} offset={`${(i * 100) / (RAINBOW_COLORS.length - 1)}%`} stopColor={c} />
                ))}
              </linearGradient>
            </defs>
          </Box>
          <Button
            size="small"
            variant="contained"
            startIcon={
              refreshing ? (
                <CircularProgress
                  size={14}
                  sx={{ '& .MuiCircularProgress-circle': { stroke: `url(#${RAINBOW_GRADIENT_ID})` } }}
                />
              ) : (
                <RefreshIcon />
              )
            }
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error">
          Failed to load performance data: {error.message || 'unknown error'}
        </Alert>
      )}

      <PlanUsageCard
        usage={usageQuery.data}
        loading={usageQuery.isLoading}
        error={usageQuery.error}
      />

      <SummaryCards summary={summary} loading={isLoading} />

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>Model usage</Typography>
          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <ModelUsageChart models={summary?.models || []} />
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default PerformanceSection;
