/**
 * @fileoverview The navigator's width: a handle on its right edge to drag
 * (or move with the arrow keys), double-click to reset. The width is kept
 * between visits.
 */
import { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import usePersistedState from '../../hooks/usePersistedState';

export const NAV_DEFAULT = 280;
const NAV_MIN = 220;
const NAV_MAX = 560;
const STEP = 16;
const clamp = (w) => Math.min(NAV_MAX, Math.max(NAV_MIN, Math.round(w)));

/** @returns {[number, (w: number) => void]} the navigator width and a setter that keeps it in range. */
export function useNavWidth() {
  const [width, setWidth] = usePersistedState('cckiro.navWidth', NAV_DEFAULT);
  return [clamp(Number(width) || NAV_DEFAULT), (w) => setWidth(clamp(w))];
}

/**
 * @param {Object} props
 * @param {number} props.width
 * @param {(w: number) => void} props.onWidth
 */
export function NavResizer({ width, onWidth }) {
  const [drag, setDrag] = useState(null); // { startX, startWidth } while dragging

  useEffect(() => {
    if (!drag) return undefined;
    const move = (e) => onWidth(drag.startWidth + e.clientX - drag.startX);
    const stop = () => setDrag(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [drag, onWidth]);

  return (
    <Box role="separator" aria-orientation="vertical" aria-label="Navigator width" tabIndex={0}
      aria-valuenow={width} aria-valuemin={NAV_MIN} aria-valuemax={NAV_MAX}
      title="Drag to resize, double-click to reset"
      onPointerDown={(e) => { e.preventDefault(); setDrag({ startX: e.clientX, startWidth: width }); }}
      onDoubleClick={() => onWidth(NAV_DEFAULT)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onWidth(width - STEP);
        if (e.key === 'ArrowRight') onWidth(width + STEP);
      }}
      sx={{
        position: 'absolute', top: 0, right: -3, bottom: 0, width: 6, zIndex: 2, cursor: 'col-resize',
        bgcolor: drag ? 'primary.main' : 'transparent', transition: 'background-color .15s',
        '&:hover, &:focus-visible': { bgcolor: 'primary.main', outline: 'none' },
      }} />
  );
}
