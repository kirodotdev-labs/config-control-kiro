/**
 * @fileoverview Two side-by-side panes with a draggable divider. The split is
 * remembered per persistKey.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import usePersistedState from '../hooks/usePersistedState';
import { SURFACE } from '../theme';

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

/**
 * @param {Object} props
 * @param {string} props.persistKey localStorage key for the split.
 * @param {number} [props.initial] left pane width in percent.
 * @param {React.ReactNode} props.left
 * @param {React.ReactNode} props.right
 */
export function SplitPane({ persistKey, initial = 50, left, right }) {
  const [percent, setPercent] = usePersistedState(`split:${persistKey}`, initial);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef(null);

  const onMove = useCallback((e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) setPercent(clamp(((e.clientX - rect.left) / rect.width) * 100, 20, 80));
  }, [setPercent]);

  useEffect(() => {
    if (!dragging) return undefined;
    const stop = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', stop);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', stop);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [dragging, onMove]);

  return (
    <Box ref={containerRef} sx={{ flexGrow: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
      {/* flexShrink 0 / flexBasis 0: the panes split by percent, never by content width
          (a long JSON line would otherwise squeeze the left pane to nothing). */}
      <Box sx={{ width: `${percent}%`, flexShrink: 0, minWidth: 0, minHeight: 0, overflow: 'auto' }}>{left}</Box>
      <Box
        role="separator" aria-orientation="vertical" onMouseDown={(e) => { e.preventDefault(); setDragging(true); }}
        onDoubleClick={() => setPercent(initial)}
        title="Drag to resize, double-click to reset"
        sx={{
          width: 5, flexShrink: 0, cursor: 'col-resize',
          bgcolor: dragging ? 'primary.main' : SURFACE.border,
          '&:hover': { bgcolor: 'primary.main' }, transition: 'background-color .15s',
        }}
      />
      <Box sx={{ flex: '1 1 0', minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>{right}</Box>
    </Box>
  );
}
