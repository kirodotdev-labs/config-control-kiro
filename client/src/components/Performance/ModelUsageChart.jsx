/**
 * @fileoverview Horizontal bar chart of assistant-turn count per model.
 * Uses recharts with a responsive container so the chart resizes with
 * its parent Card.
 */
import React from 'react';
import { Box, Typography } from '@mui/material';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

/**
 * @param {Object} props
 * @param {Array<{modelId: string, count: number}>} props.models
 */
const ModelUsageChart = ({ models }) => {
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
  const height = Math.max(120, data.length * 40 + 40);

  return (
    <Box sx={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" allowDecimals={false} />
          <YAxis type="category" dataKey="modelId" width={180} />
          <Tooltip
            formatter={(value) => [value.toLocaleString(), 'turns']}
            labelFormatter={(label) => `Model: ${label}`}
          />
          <Bar dataKey="count" fill="#1976d2" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
};

export default ModelUsageChart;
