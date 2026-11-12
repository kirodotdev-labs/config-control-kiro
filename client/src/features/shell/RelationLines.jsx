/**
 * @fileoverview Draws the selected item's connections over the navigator: a
 * dotted spine down the left edge with a branch and a dot at every connected
 * row. Rows are found by their data-node-id, so the lines follow the tree as
 * groups open, close or scroll. Inherited connections are drawn faint. When
 * the selected row is folded away, the lines start from the first visible
 * row in anchorIds (its group), marked with a ring instead of a dot.
 * While an agent is selected, the dot at the end of a line shows what that
 * row adds to the agent's context with every message: bigger for more
 * tokens, a ring when not measured yet, none when it adds nothing. Hovering
 * a dot shows the count.
 */
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { m } from 'motion/react';
import { Tooltip } from '@mui/material';
import { ACCENT } from '../../theme';
import { contextDots } from '../../domain/relations.js';

const SPINE_X = 6;

/** Centre-left point of a row inside the scroll container, or null if it isn't rendered. */
function rowPoint(container, id) {
  const el = container.querySelector(`[data-node-id="${CSS.escape(id)}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.height) return null;
  const c = container.getBoundingClientRect();
  return {
    x: r.left - c.left + container.scrollLeft + parseFloat(getComputedStyle(el).paddingLeft),
    y: r.top - c.top + container.scrollTop + r.height / 2,
  };
}

/**
 * @param {Object} props
 * @param {React.RefObject<HTMLElement>} props.containerRef the scrolling tree element.
 * @param {string[]} props.anchorIds the selected row, then the rows that stand in for it while it's folded away.
 * @param {{id: string, inherited: boolean, context?: Object, mcp?: boolean}[]} props.targets rows to connect; context is what the row adds to the agent's context.
 */
export function RelationLines({ containerRef, anchorIds, targets }) {
  const [geom, setGeom] = useState(null);
  const targetKey = targets.map((t) => `${t.id}:${t.inherited ? 1 : 0}`).join('|');
  const dots = contextDots(targets);
  const anchorKey = anchorIds.join('|');
  const selectedId = anchorIds[0];

  const measure = useCallback(() => {
    const c = containerRef.current;
    if (!c) return;
    const anchor = anchorIds.map((id, i) => ({ p: rowPoint(c, id), folded: i > 0 })).find((a) => a.p);
    const points = targets.map((t) => ({ ...t, p: rowPoint(c, t.id) })).filter((t) => t.p);
    setGeom(anchor && points.length ? { self: anchor.p, folded: anchor.folded, points, height: c.scrollHeight } : null);
    // The keys stand in for anchorIds and targets, which are new arrays every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, anchorKey, targetKey]);

  useLayoutEffect(() => { measure(); }, [measure]);

  // Re-measure while groups animate open, rows load, or the navigator or window resizes.
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return undefined;
    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const mo = new MutationObserver(schedule);
    mo.observe(c, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    const ro = new ResizeObserver(schedule);
    ro.observe(c);
    return () => { mo.disconnect(); ro.disconnect(); cancelAnimationFrame(frame); };
  }, [containerRef, measure]);

  if (!geom) return null;
  const ys = [geom.self.y, ...geom.points.map((t) => t.p.y)];
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const draw = { initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 1 } };

  return (
    <svg key={selectedId} aria-hidden width="100%" height={geom.height}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible', zIndex: 1 }}>
      <m.path d={`M${SPINE_X},${top} V${bottom}`} stroke={ACCENT} strokeWidth={1.5} strokeDasharray="2 4" strokeLinecap="round"
        fill="none" {...draw} transition={{ duration: 0.45, ease: 'easeOut' }} />
      <m.path d={`M${SPINE_X},${geom.self.y} H${geom.self.x}`} stroke={ACCENT} strokeWidth={2} fill="none" {...draw} transition={{ duration: 0.25 }} />
      {geom.points.map((t, i) => (
        <g key={t.id} opacity={t.inherited ? 0.45 : 1}>
          <m.path d={`M${SPINE_X},${t.p.y} H${t.p.x}`} stroke={ACCENT} strokeWidth={1.5} fill="none"
            strokeDasharray={t.inherited ? '2 3' : undefined} {...draw} transition={{ duration: 0.25, delay: 0.25 + i * 0.03 }} />
          {dots.has(t.id) && (
            <Tooltip title={dots.get(t.id).title} placement="right">
              <m.circle cx={t.p.x} cy={t.p.y} r={dots.get(t.id).r} data-context-dot={t.id} data-ring={dots.get(t.id).ring || undefined}
                fill={dots.get(t.id).ring ? 'none' : ACCENT} stroke={ACCENT} strokeWidth={dots.get(t.id).ring ? 1.5 : 0}
                style={{ pointerEvents: 'all' }} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.4 + i * 0.03 }} />
            </Tooltip>
          )}
          <circle cx={SPINE_X} cy={t.p.y} r={2.5} fill={ACCENT} />
        </g>
      ))}
      <m.circle cx={SPINE_X} cy={geom.self.y} r={4.5} fill={geom.folded ? 'none' : ACCENT} stroke={ACCENT} strokeWidth={geom.folded ? 1.5 : 0}
        data-anchor={geom.folded ? 'folded' : 'self'} style={{ filter: `drop-shadow(0 0 4px ${ACCENT})` }}
        initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.2 }} />
    </svg>
  );
}
