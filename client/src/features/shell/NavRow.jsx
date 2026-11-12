/**
 * @fileoverview One row of the navigator tree: indent, expand arrow, icon,
 * label and an optional action that shows on hover.
 */
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import { KeyboardArrowDown, KeyboardArrowRight } from '@mui/icons-material';
import { ACCENT, SURFACE } from '../../theme';

/**
 * @param {Object} props
 * @param {number} props.depth
 * @param {boolean} [props.expandable]
 * @param {boolean} [props.open]
 * @param {React.ReactNode} props.icon
 * @param {string} props.label
 * @param {string} [props.sub] second line (e.g. a path).
 * @param {boolean} [props.selected]
 * @param {boolean} [props.dim] for things that don't exist on disk yet.
 * @param {() => void} props.onClick
 * @param {() => void} [props.onToggle]
 * @param {React.ReactNode} [props.action]
 * @param {string} [props.nodeId] marks the row so relation lines can find it.
 * @param {'self'|'linked'|'inherited'|'unused'|'muted'} [props.relation] how the row relates to the selection.
 * @param {string} [props.title] shown on hover: the row's full path, and how it's connected (one per line).
 * @param {{color: string, title: string}} [props.badge] a small status dot after the label.
 */
export function NavRow({ depth, expandable, open, icon, label, sub, selected, dim, onClick, onToggle, action, nodeId, relation, title, badge }) {
  const opacity = relation === 'muted' ? 0.35 : relation === 'inherited' || relation === 'unused' ? 0.7 : dim ? 0.5 : 1;
  const row = (
    <Box
      role="treeitem" aria-selected={!!selected} aria-expanded={expandable ? !!open : undefined} tabIndex={0}
      data-node-id={nodeId}
      onClick={onClick} onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
      sx={{
        display: 'flex', alignItems: 'center', gap: 0.75, pr: 1, pl: 1 + depth * 1.5, minHeight: 30,
        cursor: 'pointer', borderRadius: 1, position: 'relative', opacity, transition: 'opacity .25s',
        bgcolor: selected ? SURFACE.raised : 'transparent',
        '&:hover, &:focus-visible': { bgcolor: SURFACE.raised, outline: 'none' },
        '&:hover .row-action, &:focus-within .row-action': { opacity: 1 },
      }}
    >
      {expandable ? (
        <IconButton size="small" sx={{ p: 0, width: 16, height: 16 }} aria-label={open ? 'Collapse' : 'Expand'}
          onClick={(e) => { e.stopPropagation(); (onToggle || onClick)(); }}>
          {open ? <KeyboardArrowDown sx={{ fontSize: 16 }} /> : <KeyboardArrowRight sx={{ fontSize: 16 }} />}
        </IconButton>
      ) : <Box sx={{ width: 16, flexShrink: 0 }} />}
      {icon}
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="body2" noWrap sx={{ color: selected || relation === 'linked' ? 'text.primary' : 'text.secondary', fontWeight: selected ? 600 : 400 }}>
          {label}
        </Typography>
        {sub && <Typography variant="caption" noWrap sx={{ display: 'block', fontSize: '0.65rem', color: 'text.secondary', opacity: 0.7 }}>{sub}</Typography>}
      </Box>
      {badge && <Box title={badge.title} aria-label={badge.title} sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: badge.color, flexShrink: 0 }} />}
      {selected && <Box sx={{ position: 'absolute', left: 0, top: 4, bottom: 4, width: 3, bgcolor: ACCENT, borderRadius: 3 }} />}
      {action && <Box className="row-action" sx={{ opacity: 0, transition: 'opacity .15s' }} onClick={(e) => e.stopPropagation()}>{action}</Box>}
    </Box>
  );
  if (!title) return row;
  return (
    <Tooltip title={<Box component="span" sx={{ whiteSpace: 'pre-line', wordBreak: 'break-all' }}>{title}</Box>}
      placement="right" enterDelay={400} enterNextDelay={150} disableInteractive>
      {row}
    </Tooltip>
  );
}
