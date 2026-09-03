/**
 * @fileoverview Horizontal bar chart of assistant-turn count per model.
 * Uses recharts with a responsive container so the chart resizes with
 * its parent Card.
 */
import React from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { RAINBOW_COLORS } from './colors';

/**
 * barColor returns a distinct colour for each bar. The first entries use the
 * shared rainbow palette; beyond that, evenly spaced hues are generated so no
 * two models ever share a colour, however many models are present.
 *
 * @param {number} index - zero-based bar index
 * @param {number} total - total number of bars
 * @returns {string} CSS colour
 */
const barColor = (index, total) => {
  if (total <= RAINBOW_COLORS.length) return RAINBOW_COLORS[index];
  const hue = Math.round((index * 360) / total);
  return `hsl(${hue}, 65%, 50%)`;
};

/**
 * @param {Object} props
 * @param {Array<{modelId: string, count: number}>} props.models
 */
const ModelUsageChart = ({ models }) => {
  const theme = useTheme();

  if (!models || models.length === 0) {
    return (
      <Box sx={{ py: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No model attribution data in this window.
        </Typography>
      </Box>
    );
  }

  const data = models.map((m) => ({
    modelId: m.modelId || 'unknown',
    count: m.count,
  }));
  const height = Math.max(140, data.length * 40 + 56);

  return (
    <Box sx={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, bottom: 24, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme.palette.divider} />
          <XAxis
            type="number"
            allowDecimals={false}
            tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
            stroke={theme.palette.divider}
            label={{
              value: 'Responses',
              position: 'insideBottom',
              offset: -8,
              fill: theme.palette.text.secondary,
              fontSize: 12,
            }}
          />
          <YAxis
            type="category"
            dataKey="modelId"
            width={180}
            tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
            stroke={theme.palette.divider}
          />
          <Tooltip
            cursor={{ fill: theme.palette.action.hover }}
            contentStyle={{
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 8,
              color: theme.palette.text.primary,
            }}
            formatter={(value) => [value.toLocaleString(), 'responses']}
            labelFormatter={(label) => `Model: ${label}`}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell key={entry.modelId} fill={barColor(index, data.length)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
};

export default ModelUsageChart;
