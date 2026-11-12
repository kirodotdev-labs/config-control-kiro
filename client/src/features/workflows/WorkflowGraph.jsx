/**
 * @fileoverview A workflow recipe drawn as a graph, after the figure in
 * kiro.dev/docs/workflows: numbered steps joined by arrows, a repeat as a
 * dashed frame with its stop gate and loop back, a parallel as side-by-side
 * lanes with its join, a wait as its own node. Select a node to edit it; the
 * nodes it reads from and the nodes that read it are joined by lines. With
 * `status` (from a run), each node shows how far it got.
 */
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Box, Chip, IconButton, Menu, MenuItem, Stack, Tooltip, Typography } from '@mui/material';
import { Add, Loop, HourglassEmpty } from '@mui/icons-material';
import { artifactOwners, childKey, nodeLabel, NODE_TYPES, readsFrom, RUN_STATUS, walkNodes } from '../../domain/workflows.js';
import { isObject } from '../../domain/json.js';
import { SURFACE } from '../../theme';

const key = (path) => path.join('/');
const ACCENT = { step: 'primary.main', repeat: 'warning.main', parallel: 'info.main', watch: 'success.main', sequence: 'text.secondary' };

/** A stop condition in a few words. */
function stopText(node) {
  if (typeof node.stopWhen === 'string') return node.stopWhen;
  const sc = node.stopCondition;
  if (!isObject(sc)) return 'runs to the cap';
  if ('containsText' in sc) return `output contains "${sc.containsText}"`;
  if ('completionSignal' in sc) return `step signals ${sc.completionSignal}`;
  if (isObject(sc.fileCheck)) return `${sc.fileCheck.path?.split('/').pop() || 'file'}: ${sc.fileCheck.jsonPath} = ${JSON.stringify(sc.fileCheck.value)}`;
  return 'condition';
}

/** The + on an arrow: insert a node of any type at that place. */
function InsertButton({ onInsert, label = 'Insert here' }) {
  const [anchor, setAnchor] = useState(null);
  return (
    <>
      <Tooltip title={label}>
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); setAnchor(e.currentTarget); }} aria-label={label}
          sx={{ width: 20, height: 20, border: `1px solid ${SURFACE.border}`, bgcolor: SURFACE.panel, '&:hover': { borderColor: 'primary.main' } }}>
          <Add sx={{ fontSize: 14 }} />
        </IconButton>
      </Tooltip>
      {/* The menu is portalled, but React still bubbles its clicks to the graph, whose background click clears the selection. */}
      <Menu open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)} onClick={(e) => e.stopPropagation()}>
        {NODE_TYPES.map((t) => (
          <MenuItem key={t.type} onClick={() => { setAnchor(null); onInsert(t.type); }}>
            <Box><Typography variant="body2">{t.label}</Typography><Typography variant="caption" color="text.secondary">{t.hint}</Typography></Box>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

/** A downward arrow between two nodes, with + to insert there when editing. */
function Arrow({ onInsert }) {
  return (
    <Stack sx={{ alignItems: 'center', py: 0.25 }}>
      <Box component="svg" viewBox="0 0 20 14" sx={{ width: 20, height: 14, color: 'text.disabled', display: 'block' }} aria-hidden>
        <path d="M10 0V12M6 8L10 13 14 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </Box>
      {onInsert && <InsertButton onInsert={onInsert} />}
    </Stack>
  );
}

/** A run status chip. */
function StatusChip({ s }) {
  if (!s) return <Chip size="small" variant="outlined" label="not reached" sx={{ height: 18, fontSize: 10, color: 'text.disabled' }} />;
  const info = RUN_STATUS[s.status] || { label: s.status, color: 'text.secondary' };
  const label = s.awaitingUserInput ? 'needs you' : info.label;
  return <Chip size="small" variant="outlined" label={s.runs > 1 ? `${label} · ran ${s.runs}×` : label}
    sx={{ height: 18, fontSize: 10, color: s.awaitingUserInput ? 'warning.main' : info.color, borderColor: 'currentColor' }} />;
}

/**
 * @param {Object} props
 * @param {Object} props.recipe
 * @param {(string|number)[]} props.selected path of the selected node ([] for none).
 * @param {(path: (string|number)[]) => void} props.onSelect
 * @param {(listPath: (string|number)[], index: number, type: string) => void} [props.onInsert] editing: + on arrows.
 * @param {(path: (string|number)[]) => number} [props.errorsAt] problems on a node.
 * @param {Object<string, Object>} [props.status] a run: node id → its state (runStatusById).
 */
export function WorkflowGraph({ recipe, selected, onSelect, onInsert, errorsAt = () => 0, status }) {
  const nodes = walkNodes(recipe);
  const numbers = {};
  let n = 0;
  nodes.forEach(({ path, node }) => { if (node?.type === 'step' || node?.type === 'watch') { n += 1; numbers[key(path)] = n; } });
  // Data flow around the selection: what it reads, and what reads it.
  const owners = artifactOwners(recipe);
  const selectedNode = nodes.find((x) => key(x.path) === key(selected))?.node;
  const reads = new Set();
  const readBy = new Set();
  if (selectedNode) {
    const r = readsFrom(recipe, selected);
    r.ids.forEach((id) => reads.add(id));
    r.artifacts.forEach((a) => owners[a] && reads.add(owners[a]));
    const mine = new Set([selectedNode.id, ...Object.keys(isObject(selectedNode.artifacts) ? selectedNode.artifacts : {}).map((a) => `@${a}`)]);
    nodes.forEach(({ path, node }) => {
      const x = readsFrom(recipe, path);
      if (x.ids.some((id) => mine.has(id)) || x.artifacts.some((a) => mine.has(`@${a}`))) readBy.add(node.id);
    });
  }

  const box = (path, node) => {
    const k = key(path);
    const isSel = k === key(selected);
    const role = reads.has(node.id) ? 'reads' : readBy.has(node.id) ? 'readBy' : '';
    const errors = errorsAt(path);
    const s = status?.[node.id];
    const artifacts = isObject(node.artifacts) ? Object.keys(node.artifacts) : [];
    const sub = node.type === 'watch' ? `${node.handler || 'wait'}${node.config?.prRef || node.config?.url ? ` · ${node.config.prRef || node.config.url}` : node.config?.command ? ` · ${node.config.command}` : ''}`
      : [node.agent || 'no agent', node.modelId, node.effortLevel && `${node.effortLevel} effort`].filter(Boolean).join(' · ');
    return (
      <Box key={k} component="button" type="button" data-gnode={node.id || k} onClick={(e) => { e.stopPropagation(); onSelect(path); }}
        aria-label={`${nodeLabel(node.type)} ${node.id || ''}`} aria-pressed={isSel}
        sx={{
          display: 'flex', gap: 1, alignItems: 'flex-start', width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit',
          px: 1.25, py: 1, borderRadius: 1.5, bgcolor: isSel ? 'rgba(124,92,255,.12)' : SURFACE.panel,
          border: '1px solid', borderColor: errors ? 'error.main' : isSel ? 'primary.main' : role ? 'secondary.main' : SURFACE.border,
          borderStyle: node.type === 'watch' ? 'dashed' : 'solid', '&:hover': { borderColor: 'primary.light' },
        }}>
        <Box sx={{ width: 24, height: 24, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
          border: '1px solid', borderColor: s ? (RUN_STATUS[s.status]?.color || ACCENT[node.type]) : ACCENT[node.type], color: s ? (RUN_STATUS[s.status]?.color || ACCENT[node.type]) : ACCENT[node.type] }}>
          {node.type === 'watch' ? <HourglassEmpty sx={{ fontSize: 13 }} /> : String(numbers[k] || '').padStart(2, '0')}
        </Box>
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.25 }}>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{node.id || '(no id)'}</Typography>
            {status && <StatusChip s={s} />}
            {errors > 0 && <Chip size="small" color="error" variant="outlined" label={`${errors} to fix`} sx={{ height: 18, fontSize: 10 }} />}
            {role === 'reads' && <Chip size="small" color="secondary" variant="outlined" label={`feeds ${selectedNode?.id}`} sx={{ height: 18, fontSize: 10 }} />}
            {role === 'readBy' && <Chip size="small" color="secondary" variant="outlined" label={`reads ${selectedNode?.id}`} sx={{ height: 18, fontSize: 10 }} />}
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontFamily: 'monospace' }} noWrap>{sub}</Typography>
          {artifacts.length > 0 && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} noWrap>writes {artifacts.join(', ')}</Typography>}
        </Box>
      </Box>
    );
  };

  const frame = (path, node, children) => {
    const k = key(path);
    const isSel = k === key(selected);
    const errors = errorsAt(path);
    const s = status?.[node.id];
    const color = ACCENT[node.type];
    return (
      <Box key={k} data-gnode={node.id || k} onClick={(e) => { e.stopPropagation(); onSelect(path); }}
        sx={{ p: 1, pt: 0.5, borderRadius: 1.5, border: '1px dashed', borderColor: errors ? 'error.main' : isSel ? 'primary.main' : color, bgcolor: isSel ? 'rgba(124,92,255,.06)' : 'transparent', cursor: 'pointer' }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.5, flexWrap: 'wrap' }}>
          {node.type === 'repeat' && <Loop sx={{ fontSize: 15, color }} />}
          <Typography variant="caption" sx={{ color, fontWeight: 700 }}>{nodeLabel(node.type)}</Typography>
          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{node.id || '(no id)'}</Typography>
          {node.type === 'repeat' && <Typography variant="caption" color="text.secondary">up to {node.maxIterations ?? '?'}×{stopText(node) === 'runs to the cap' ? '' : ` · until ${stopText(node)}`}</Typography>}
          {node.type === 'parallel' && <Typography variant="caption" color="text.secondary">join: {node.joinPolicy || '?'}</Typography>}
          {status && <StatusChip s={s} />}
          {errors > 0 && <Chip size="small" color="error" variant="outlined" label={`${errors} to fix`} sx={{ height: 18, fontSize: 10 }} />}
        </Stack>
        {children}
        {node.type === 'repeat' && (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
            <Box sx={{ width: 14, height: 14, transform: 'rotate(45deg)', border: '1px solid', borderColor: color, flexShrink: 0, ml: 0.5 }} aria-hidden />
            <Typography variant="caption" color="text.secondary">
              {stopText(node) === 'runs to the cap' ? 'no stop condition' : `stops when ${stopText(node)}`}; otherwise ↺ again{node.onMaxIterations ? `, and at the cap: ${node.onMaxIterations}` : ''}
            </Typography>
          </Stack>
        )}
      </Box>
    );
  };

  const render = (path, node) => {
    if (!isObject(node)) return null;
    const ck = childKey(node.type);
    if (!ck) return box(path, node);
    const list = Array.isArray(node[ck]) ? node[ck] : [];
    const listPath = [...path, ck];
    if (node.type === 'parallel') {
      return frame(path, node, (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
          {list.map((b, i) => <Box key={i} sx={{ flex: 1, minWidth: 180 }}>{render([...listPath, i], b)}</Box>)}
          {onInsert && <Box sx={{ alignSelf: 'center' }}><InsertButton label="Add a branch" onInsert={(t) => onInsert(listPath, list.length, t)} /></Box>}
          {!list.length && !onInsert && <Typography variant="caption" color="text.secondary">no branches</Typography>}
        </Stack>
      ));
    }
    return frame(path, node, column(listPath, list));
  };

  const column = (listPath, list) => (
    <Box>
      {onInsert && !list.length && <Stack sx={{ alignItems: 'center', py: 0.5 }}><InsertButton label="Add inside" onInsert={(t) => onInsert(listPath, 0, t)} /></Stack>}
      {list.map((node, i) => (
        <Box key={i}>
          {i > 0 && <Arrow onInsert={onInsert && ((t) => onInsert(listPath, i, t))} />}
          {render([...listPath, i], node)}
        </Box>
      ))}
      {onInsert && list.length > 0 && <Stack sx={{ alignItems: 'center', pt: 0.5 }}><InsertButton label="Add after" onInsert={(t) => onInsert(listPath, list.length, t)} /></Stack>}
    </Box>
  );

  // Lines from the selection to the nodes it reads and the nodes that read it.
  const host = useRef(null);
  const [lines, setLines] = useState([]);
  const relatedKey = [...reads, '|', ...readBy].join(',');
  const measure = useCallback(() => {
    const el = host.current;
    if (!el || !selectedNode?.id) { setLines([]); return; }
    const at = (id) => el.querySelector(`[data-gnode="${CSS.escape(id)}"]`)?.getBoundingClientRect();
    const base = el.getBoundingClientRect();
    const me = at(selectedNode.id);
    if (!me) { setLines([]); return; }
    const y = (r) => r.top - base.top + el.scrollTop + Math.min(18, r.height / 2);
    const x = (r) => r.right - base.left + el.scrollLeft;
    setLines([...reads, ...readBy].map((id) => ({ id, r: at(id), into: reads.has(id) })).filter((l) => l.r).map(({ id, r, into }) => {
      const [a, b] = into ? [r, me] : [me, r];
      const bulge = Math.max(x(a), x(b)) + 24 + Math.abs(y(a) - y(b)) / 8;
      return { id, d: `M${x(a)},${y(a)} C${bulge},${y(a)} ${bulge},${y(b)} ${x(b)},${y(b)}` };
    }));
    // relatedKey stands in for reads/readBy, new Sets on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode?.id, relatedKey]);
  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (host.current) ro.observe(host.current);
    return () => ro.disconnect();
  }, [measure, recipe]);

  const inputs = isObject(recipe?.inputs) ? Object.keys(recipe.inputs) : [];
  const artifacts = Object.keys(owners);
  return (
    <Box ref={host} sx={{ position: 'relative', p: 2, pr: 5 }} onClick={() => onSelect([])} data-section="graph">
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 1, rowGap: 0.5 }}>
        <Typography variant="caption" color="text.secondary">Asks for</Typography>
        {inputs.map((i) => <Chip key={i} size="small" variant="outlined" label={`{{${i}}}`} sx={{ fontFamily: 'monospace', height: 20 }} />)}
        {!inputs.length && <Typography variant="caption" color="text.secondary">nothing</Typography>}
      </Stack>
      {column(['steps'], Array.isArray(recipe?.steps) ? recipe.steps : [])}
      {artifacts.length > 0 && (
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', mt: 1.5, rowGap: 0.5 }}>
          <Typography variant="caption" color="text.secondary">Files it writes</Typography>
          {artifacts.map((a) => <Chip key={a} size="small" variant="outlined" label={a} sx={{ fontFamily: 'monospace', height: 20 }} />)}
        </Stack>
      )}
      {lines.length > 0 && (
        <Box component="svg" aria-hidden sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible', color: 'secondary.main' }}>
          <defs><marker id="wf-dot" markerWidth="6" markerHeight="6" refX="3" refY="3"><circle cx="3" cy="3" r="2.5" fill="currentColor" /></marker></defs>
          {lines.map((l) => <path key={l.id} d={l.d} fill="none" stroke="currentColor" strokeWidth="1.3" strokeDasharray="4 3" markerEnd="url(#wf-dot)" />)}
        </Box>
      )}
    </Box>
  );
}
