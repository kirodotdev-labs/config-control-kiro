/**
 * @fileoverview The configuration surfaces of the active scope (agents, MCP,
 * permissions, hooks, steering, skills, sandbox), each group expandable to its
 * files. Groups that hold files offer a "+" to create one.
 */
import { useEffect, useRef, useState } from 'react';
import { Box, Collapse, IconButton, Tooltip, Typography } from '@mui/material';
import { Add } from '@mui/icons-material';
import { useSurfaces } from '../../data/useSystem';
import { useAgentSummaries } from '../../data/useAgents';
import { errorMessage } from '../../data/errors';
import { NavRow } from './NavRow';
import { SurfaceIcon } from './surfaceIcons';
import { canCreateIn } from './NewFileDialog';
import { OtherRows } from './OtherRows';
import { rowRelation } from '../../domain/relations.js';

/**
 * @param {Object} props
 * @param {number} props.depth
 * @param {string} [props.selectedId]
 * @param {(node: Object) => void} props.onSelect
 * @param {(group: Object) => void} props.onCreate "+" on a group, or on a skill (add a file to it).
 * @param {Object} props.view relation view of the selection (domain/relations.js).
 * @param {number} props.collapseAll changes when "Collapse all" is pressed.
 */
export function SurfaceTree({ depth, selectedId, onSelect, onCreate, view, collapseAll }) {
  const { data, isLoading, isError, error } = useSurfaces();
  const [open, setOpen] = useState({});
  // "Collapse all" closes every group explicitly, so relation auto-open can't
  // reopen them. Only a press while mounted counts, not the value at mount.
  const lastCollapse = useRef(collapseAll);
  useEffect(() => {
    if (collapseAll === lastCollapse.current) return;
    lastCollapse.current = collapseAll;
    setOpen(Object.fromEntries((data?.nodes || []).map((n) => [n.id, false])));
    // Only the button press should fold the groups, not a data refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapseAll]);
  // An explicit open/close wins; otherwise groups holding connected rows open.
  const isOpen = (id) => open[id] ?? view.openGroups.has(id);
  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !isOpen(id) }));
  const rel = (id) => rowRelation(view, id, selectedId);
  // Hover: the row's full path (an MCP server: its mcp.json and name), then how it's connected to the selection.
  const hover = (n) => [n.kind === 'mcpserver' ? `${n.path} → ${n.name}` : n.path, view.linked.get(n.id)?.via].filter(Boolean).join('\n');
  const v3 = Object.fromEntries((useAgentSummaries().data || []).map((a) => [`agent:${a.id}`, a.v3?.kiro === 'out-of-sync' ? 'sync' : a.v3?.state]));
  // 2.x: dots for agents that still need Kiro's upgrade; remove with V2 support.
  const badge = (id) => ({
    blocked: { color: 'warning.main', title: 'A CLI 2.x agent: Kiro upgrades it for V3' },
    upgrade: { color: 'warning.main', title: 'Uses CLI 2.x settings that V3 ignores' },
    sync: { color: 'warning.main', title: 'Upgraded by Kiro, then edited: out of sync' },
  })[v3[id]];
  // A group that holds connected files stays readable; it frames the connection.
  const groupRel = (id) => (view.openGroups.has(id) && rel(id) === 'muted' ? undefined : rel(id));
  const pad = { pl: 1 + depth * 1.5, py: 0.5, display: 'block', color: 'text.secondary' };

  if (isLoading) return <Typography variant="caption" sx={pad}>Loading…</Typography>;
  if (isError) return <Typography variant="caption" color="error" sx={pad}>{errorMessage(error)}</Typography>;

  const rows = (data?.nodes || []).map((node) => {
    const children = node.children || [];
    const creatable = canCreateIn(node.kind) || node.kind === 'agents';
    const expandable = children.length > 0;
    return (
      <Box key={node.id}>
        <NavRow
          nodeId={node.id} relation={groupRel(node.id)} title={hover(node)}
          depth={depth} expandable={expandable} open={isOpen(node.id)} icon={<SurfaceIcon kind={node.kind} />}
          label={expandable ? `${node.name} (${children.length})` : node.name} selected={selectedId === node.id}
          dim={!node.exists && !expandable}
          onToggle={() => toggle(node.id)}
          onClick={() => { if (expandable && !isOpen(node.id)) toggle(node.id); onSelect(node); }}
          action={creatable && (
            <Tooltip title={`New in ${node.name}`}>
              <IconButton size="small" onClick={() => onCreate(node)}><Add sx={{ fontSize: 16 }} /></IconButton>
            </Tooltip>
          )}
        />
        {expandable && (
          <Collapse in={isOpen(node.id)} unmountOnExit>
            {children.map((leaf) => {
              const files = leaf.children || []; // a skill: SKILL.md's folder with its scripts, references and assets
              const folder = files.length > 0 || leaf.id.startsWith('skill:');
              return (
                <Box key={leaf.id}>
                  <NavRow nodeId={leaf.id} relation={rel(leaf.id)} title={hover(leaf)} badge={badge(leaf.id)}
                    depth={depth + 1} icon={<SurfaceIcon kind={leaf.kind} />} label={folder ? `${leaf.name}/` : leaf.name}
                    expandable={files.length > 0} open={isOpen(leaf.id)} onToggle={() => toggle(leaf.id)}
                    selected={selectedId === leaf.id} dim={leaf.disabled} onClick={() => onSelect(leaf)}
                    action={leaf.id.startsWith('skill:') && (
                      <Tooltip title={`Add a file to ${leaf.name}`}>
                        <IconButton size="small" onClick={() => onCreate(leaf)}><Add sx={{ fontSize: 16 }} /></IconButton>
                      </Tooltip>
                    )} />
                  {files.length > 0 && (
                    <Collapse in={isOpen(leaf.id)} unmountOnExit>
                      {files.map((f) => (
                        <NavRow key={f.id} nodeId={f.id} relation={rel(f.id)} title={f.path} depth={depth + 2}
                          icon={<SurfaceIcon kind={f.kind} />} label={f.name} selected={selectedId === f.id} onClick={() => onSelect(f)} />
                      ))}
                    </Collapse>
                  )}
                </Box>
              );
            })}
          </Collapse>
        )}
      </Box>
    );
  });
  return <>{rows}<OtherRows items={view.other} depth={depth} selectedId={selectedId} onSelect={onSelect} /></>;
}
