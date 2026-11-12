/**
 * @fileoverview The app's code editor. CodeMirror is loaded the first time an
 * editor is shown, so the navigator and lists render without waiting for it.
 * Props are those of CodeMirrorView: value, onChange, language, readOnly, highlightKey, highlightKeys, onCursorKey, cursorDepth, handle.
 */
import { lazy, Suspense } from 'react';
import { Loading } from './States';

const CodeMirrorView = lazy(() => import('./CodeMirrorView'));

export function CodeEditor(props) {
  return (
    <Suspense fallback={<Loading label="Loading editor…" />}>
      <CodeMirrorView {...props} />
    </Suspense>
  );
}
