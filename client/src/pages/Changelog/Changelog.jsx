/**
 * @fileoverview Changelog page displaying version history with filtering and search.
 */
import React, { useState, useMemo } from 'react';
import { useQuery } from 'react-query';
import {
  Box, Typography, Chip, TextField, InputAdornment, Card, CardContent,
  Collapse, IconButton, CircularProgress, Alert, ToggleButton, ToggleButtonGroup,
  Button, Link
} from '@mui/material';
import {
  Search, ExpandMore, ExpandLess, AutoAwesome, Build, SwapHoriz,
  FiberManualRecord, Diamond, NewReleases, OpenInNew
} from '@mui/icons-material';
import { getChangelog } from '../../services/api';
import LaunchDialog from '../../components/Launcher/LaunchDialog';

const categoryConfig = {
  added: { label: 'Added', icon: <AutoAwesome sx={{ fontSize: 14 }} />, color: '#4caf50', bg: '#4caf5020' },
  fixed: { label: 'Fixed', icon: <Build sx={{ fontSize: 14 }} />, color: '#ff9800', bg: '#ff980020' },
  changed: { label: 'Changed', icon: <SwapHoriz sx={{ fontSize: 14 }} />, color: '#2196f3', bg: '#2196f320' },
};

const ItemList = ({ items, type }) => {
  const cfg = categoryConfig[type];
  if (!items?.length) return null;
  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Chip icon={cfg.icon} label={cfg.label} size="small"
          sx={{ bgcolor: cfg.bg, color: cfg.color, fontWeight: 600, '& .MuiChip-icon': { color: cfg.color } }} />
        <Typography variant="caption" color="text.secondary">{items.length}</Typography>
      </Box>
      {items.map((item, i) => (
        <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', py: 0.75, px: 2,
          borderLeft: `3px solid ${cfg.color}20`, mb: 0.5, borderRadius: '0 4px 4px 0',
          bgcolor: 'action.hover', '&:hover': { bgcolor: cfg.bg } }}>
          <Typography variant="body2" sx={{ lineHeight: 1.6 }}>{item}</Typography>
        </Box>
      ))}
    </Box>
  );
};

const UpdateCard = ({ entry }) => {
  const [expanded, setExpanded] = useState(true);
  return (
    <Box sx={{ display: 'flex', mb: 2 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mr: 2, minWidth: 24 }}>
        <NewReleases sx={{ fontSize: 20, color: '#7c3aed', mt: 2.5 }} />
        <Box sx={{ flex: 1, width: 2, bgcolor: '#7c3aed40', mt: 0.5 }} />
      </Box>
      <Card sx={{ flex: 1, border: '1px solid', borderColor: '#7c3aed', bgcolor: '#7c3aed08' }}>
        <CardContent sx={{ pb: expanded ? 2 : '16px !important' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
            onClick={() => setExpanded(!expanded)}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="h6" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                v{entry.version}
              </Typography>
              <Chip label="UPDATE" size="small" sx={{ fontWeight: 700, fontSize: 10, height: 20, bgcolor: '#7c3aed', color: '#fff' }} />
              <Typography variant="caption" color="text.secondary">{entry.date}</Typography>
            </Box>
            <IconButton size="small">
              {expanded ? <ExpandLess /> : <ExpandMore />}
            </IconButton>
          </Box>
          <Collapse in={expanded}>
            <Box sx={{ mt: 2 }}>
              {entry.summary && (
                <Typography variant="body2" sx={{ lineHeight: 1.6, mb: 1 }}>{entry.summary}</Typography>
              )}
              {entry.link && (
                <Link href={entry.link} target="_blank" rel="noopener" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: 13 }}>
                  View full release notes <OpenInNew sx={{ fontSize: 14 }} />
                </Link>
              )}
            </Box>
          </Collapse>
        </CardContent>
      </Card>
    </Box>
  );
};

const VersionCard = ({ entry, defaultExpanded, activeFilter }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const totalItems = (entry.added?.length || 0) + (entry.fixed?.length || 0) + (entry.changed?.length || 0);

  const showAdded = !activeFilter || activeFilter === 'all' || activeFilter === 'added';
  const showFixed = !activeFilter || activeFilter === 'all' || activeFilter === 'fixed';
  const showChanged = !activeFilter || activeFilter === 'all' || activeFilter === 'changed';

  return (
    <Box sx={{ display: 'flex', mb: 2 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mr: 2, minWidth: 24 }}>
        {entry.isRelease ? (
          <Diamond sx={{ fontSize: 20, color: 'primary.main', mt: 2.5 }} />
        ) : (
          <FiberManualRecord sx={{ fontSize: 12, color: 'text.secondary', mt: 3 }} />
        )}
        <Box sx={{ flex: 1, width: 2, bgcolor: 'divider', mt: 0.5 }} />
      </Box>
      <Card sx={{ flex: 1, border: entry.isRelease ? '1px solid' : 'none',
        borderColor: entry.isRelease ? 'primary.main' : 'transparent' }}>
        <CardContent sx={{ pb: expanded ? 2 : '16px !important' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
            onClick={() => setExpanded(!expanded)}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="h6" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                v{entry.version}
              </Typography>
              {entry.isRelease && (
                <Chip label="RELEASE" size="small" color="primary" sx={{ fontWeight: 700, fontSize: 10, height: 20 }} />
              )}
              {!entry.isRelease && (
                <Chip label="PATCH" size="small" variant="outlined" sx={{ fontSize: 10, height: 20 }} />
              )}
              <Typography variant="caption" color="text.secondary">{entry.date}</Typography>
              <Typography variant="caption" color="text.secondary">
                {totalItems} {totalItems === 1 ? 'change' : 'changes'}
              </Typography>
            </Box>
            <IconButton size="small">
              {expanded ? <ExpandLess /> : <ExpandMore />}
            </IconButton>
          </Box>
          <Collapse in={expanded}>
            <Box sx={{ mt: 2 }}>
              {showAdded && <ItemList items={entry.added} type="added" />}
              {showFixed && <ItemList items={entry.fixed} type="fixed" />}
              {showChanged && <ItemList items={entry.changed} type="changed" />}
            </Box>
          </Collapse>
        </CardContent>
      </Card>
    </Box>
  );
};

export default function Changelog() {
  const { data, isLoading, error } = useQuery('changelog', getChangelog, { staleTime: 5 * 60 * 1000 });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [updateDialog, setUpdateDialog] = useState(false);

  const updateEntries = useMemo(() => {
    if (!data?.entries) return [];
    return data.entries.filter(e => e.isUpdate);
  }, [data]);

  const filtered = useMemo(() => {
    if (!data?.entries) return [];
    
    // Deduplicate by version
    const seen = new Set();
    const unique = data.entries.filter(entry => {
      if (seen.has(entry.version)) return false;
      seen.add(entry.version);
      return true;
    });

    return unique.filter(entry => {
      if (filter === 'update') return entry.isUpdate;
      if (entry.isUpdate) return filter === 'all';
      const allItems = [...(entry.added || []), ...(entry.fixed || []), ...(entry.changed || [])];
      const matchesSearch = !search || entry.version.includes(search) ||
        allItems.some(item => item.toLowerCase().includes(search.toLowerCase()));
      const matchesFilter = filter === 'all' ||
        (filter === 'added' && entry.added?.length) ||
        (filter === 'fixed' && entry.fixed?.length) ||
        (filter === 'changed' && entry.changed?.length);
      return matchesSearch && matchesFilter;
    });
  }, [data, search, filter]);

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="error" sx={{ mt: 2 }}>Failed to load changelog</Alert>;

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Kiro CLI Changelog</Typography>
          <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
            {data?.current && (
              <Typography variant="body2" color="text.secondary">Current: v{data.current}</Typography>
            )}
            {data?.latestAvailable && (
              <Typography variant="body2" color="text.secondary">Latest: v{data.latestAvailable}</Typography>
            )}
          </Box>
        </Box>
        {data?.updateAvailable && (
          <Button variant="contained" size="small" onClick={() => setUpdateDialog(true)}
            sx={{ bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}>
            Check for Updates
          </Button>
        )}
      </Box>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', mb: 3 }}>
        <ToggleButtonGroup value={filter} exclusive onChange={(_, v) => v && setFilter(v)} size="small">
          <ToggleButton value="all">All</ToggleButton>
          {updateEntries.length > 0 && (
            <ToggleButton value="update" sx={{ color: '#7c3aed' }}>🚀 Update ({updateEntries.length})</ToggleButton>
          )}
          <ToggleButton value="added" sx={{ color: '#4caf50' }}>✨ Added</ToggleButton>
          <ToggleButton value="fixed" sx={{ color: '#ff9800' }}>🔧 Fixed</ToggleButton>
          <ToggleButton value="changed" sx={{ color: '#2196f3' }}>🔄 Changed</ToggleButton>
        </ToggleButtonGroup>
        <TextField size="small" placeholder="Search..." value={search}
          onChange={(e) => setSearch(e.target.value)} sx={{ width: 200 }}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }} />
      </Box>

      {/* Timeline */}
      {filtered.map((entry, i) => (
        entry.isUpdate
          ? <UpdateCard key={entry.version} entry={entry} />
          : <VersionCard key={entry.version} entry={entry} defaultExpanded={i < 3} activeFilter={filter} />
      ))}

      {filtered.length === 0 && (
        <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>No matching entries</Typography>
      )}

      <LaunchDialog
        open={updateDialog}
        onClose={() => setUpdateDialog(false)}
        command="kiro-cli update"
        title="Update Kiro CLI"
      />
    </Box>
  );
}
