/**
 * @fileoverview The "Other" section shown under the tree while an item is
 * selected: connections to things outside this scope (absolute paths, Global
 * files, paths relative to where Kiro starts). A row that is a file opens in
 * the editor; the rest are display only.
 */
import { Box, Typography } from '@mui/material';
import { Description, Link as LinkIcon, School, WarningAmber, Navigation } from '@mui/icons-material';
import { NavRow } from './NavRow';

/** Navigator id for the i-th Other row. */
export const otherId = (i) => `other:${i}`;

/** The navigator node for an Other row that is a file, or null. */
const otherNode = (o, i) => (o.kind && o.kind !== 'missing' && o.path
  ? { kind: 'file', id: otherId(i), name: o.label, path: o.path, other: o.kind }
  : null);

const ICON = {
  skill: <School sx={{ fontSize: 16 }} />,
  steering: <Navigation sx={{ fontSize: 16 }} />,
  file: <Description sx={{ fontSize: 16 }} />,
  missing: <WarningAmber sx={{ fontSize: 16, color: 'warning.main' }} />,
};

/**
 * @param {{items: {label: string, path?: string, via: string, note?: string, unused?: boolean, kind?: string}[], depth: number,
 *   selectedId?: string, onSelect: (node: Object) => void}} props
 */
export function OtherRows({ items, depth, selectedId, onSelect }) {
  if (!items.length) return null;
  return (
    <Box sx={{ mt: 0.5 }}>
      <Typography variant="overline" sx={{ display: 'block', pl: 1 + depth * 1.5, color: 'text.secondary', lineHeight: 2 }}>
        Other
      </Typography>
      {items.map((o, i) => {
        const node = otherNode(o, i);
        return (
          <NavRow key={otherId(i)} nodeId={otherId(i)} depth={depth} relation={o.unused ? 'unused' : 'linked'} selected={selectedId === otherId(i)}
            onClick={node ? () => onSelect(node) : () => {}} dim={!node}
            icon={ICON[o.kind] || <LinkIcon sx={{ fontSize: 16 }} />} label={o.label}
            sub={[o.kind === 'missing' ? 'file not found' : o.note, o.path && o.path !== o.label ? o.path : ''].filter(Boolean).join(' · ')}
            title={[o.path, o.via, node ? 'Click to edit' : ''].filter(Boolean).join('\n')} />
        );
      })}
    </Box>
  );
}
