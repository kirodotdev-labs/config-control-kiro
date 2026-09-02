/**
 * @fileoverview Plan and credits snapshot sourced from
 * `kiro-cli chat --no-interactive "/usage"` via the backend, with
 * graceful loading / error states and a linear progress bar.
 */
import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Stack,
  LinearProgress,
  Chip,
  Alert,
  Skeleton,
} from '@mui/material';

/**
 * @param {Object} props
 * @param {?Object} props.usage
 * @param {boolean} props.loading
 * @param {?Object} props.error
 */
const PlanUsageCard = ({ usage, loading, error }) => {
  if (error) {
    return (
      <Alert severity="warning" variant="outlined">
        Plan usage unavailable: {error.message || 'unknown error'}.
        Verify with <code>kiro-cli chat "/usage"</code> or run <code>kiro-cli login</code>.
      </Alert>
    );
  }

  if (loading || !usage) {
    return (
      <Card>
        <CardContent>
          <Skeleton variant="text" width="30%" height={28} />
          <Skeleton variant="text" width="70%" />
          <Skeleton variant="rectangular" height={8} sx={{ mt: 1, borderRadius: 1 }} />
        </CardContent>
      </Card>
    );
  }

  const percent = Math.max(0, usage.percent || 0);
  const barValue = Math.min(percent, 100);
  const overLimit = percent > 100;
  const color = overLimit ? 'error' : percent >= 90 ? 'warning' : 'primary';

  const usedLabel = usage.hasLimit
    ? `${usage.used.toLocaleString(undefined, { maximumFractionDigits: 2 })} of ${usage.limit.toLocaleString()} ${usage.metric.toLowerCase()}`
    : `${usage.used.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${usage.metric.toLowerCase()} used`;

  return (
    <Card>
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" spacing={1} sx={{ mb: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Plan usage
            </Typography>
            {usage.planName && (
              <Chip label={usage.planName} size="small" color="primary" variant="outlined" />
            )}
            {usage.isEnterprise && (
              <Chip label="Managed by org" size="small" variant="outlined" />
            )}
          </Stack>
          {usage.resetsOn && (
            <Typography variant="caption" color="text.secondary">
              Resets on {usage.resetsOn}
            </Typography>
          )}
        </Stack>

        <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {usedLabel}
          </Typography>
          <Typography
            variant="body2"
            sx={{ fontWeight: 600, color: overLimit ? 'error.main' : percent >= 90 ? 'warning.main' : 'text.primary' }}
          >
            {percent.toFixed(1)}%
          </Typography>
        </Stack>

        {usage.hasLimit && (
          <LinearProgress
            variant="determinate"
            value={barValue}
            color={color}
            sx={{ height: 8, borderRadius: 1 }}
          />
        )}

        {overLimit && (
          <Typography variant="caption" color="error.main" sx={{ display: 'block', mt: 1 }}>
            Over the in-plan allowance. Overages (if configured) are billed separately.
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

export default PlanUsageCard;
