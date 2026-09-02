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

const WINDOWS = [
  { value: '24h', label: 'Last 24h' },
  { value: '7d',  label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
];

const PerformanceSection = () => {
  const [range, setRange] = usePersistedState('performance.timeRange', '24h');
  const queryClient = useQueryClient();

  const summaryQuery = useQuery(
    ['performance-summary', range],
    () => getPerformanceSummary(range),
    { refetchInterval: 30_000 },
  );

  // Plan usage is expensive to fetch (spawns kiro-cli); refetch on a slow cadence.
  const usageQuery = useQuery(
    ['kiro-usage'],
    () => getKiroUsage(),
    { refetchInterval: 5 * 60_000, retry: false },
  );

  const handleRangeChange = (_e, next) => {
    if (next) setRange(next);
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries(['performance-summary', range]);
    queryClient.invalidateQueries(['kiro-usage']);
  };

  const summary = summaryQuery.data;
  const error = summaryQuery.error;
  const isLoading = summaryQuery.isLoading;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" spacing={2}>
        <Typography variant="body2" color="text.secondary">
          Read-only view of local Kiro CLI session logs. Data is aggregated on demand from ~/.kiro/sessions/.
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
          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            disabled={isLoading}
          >
            Refresh
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
          <Typography variant="h6" sx={{ mb: 1 }}>Model usage</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
            Share of assistant turns attributed to each model in the selected window. Continuation messages within a session are credited to the model that started the turn; leading messages with no reasoning block appear as "unknown".
          </Typography>
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
