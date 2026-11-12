/**
 * @fileoverview CodeMirror 6 editor for JSON, YAML, Markdown or plain text.
 * Loaded on demand through CodeEditor.jsx.
 * Controlled: `value` in, `onChange(text)` out. For JSON, `highlightKey` marks
 * a top-level field and scrolls it into view (used to show which part of the
 * file a form section edits).
 */
import { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import { EditorView, keymap, lineNumbers, drawSelection, highlightActiveLine, Decoration } from '@codemirror/view';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, foldGutter, foldKeymap, indentOnInput } from '@codemirror/language';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { markdown } from '@codemirror/lang-markdown';
import { linter, lintGutter } from '@codemirror/lint';
import { oneDark } from '@codemirror/theme-one-dark';
import { findTopLevelKey, keyPathAt } from '../domain/jsonRange.js';

const LANGUAGES = {
  json: () => [json(), linter(jsonParseLinter()), lintGutter()],
  yaml: () => [yaml()],
  markdown: () => [markdown()],
  text: () => [],
};

const setMark = StateEffect.define();
const markField = StateField.define({
  create: () => Decoration.none,
  update(marks, tr) {
    let next = marks.map(tr.changes);
    tr.effects.forEach((e) => { if (e.is(setMark)) next = e.value; });
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});
const mark = Decoration.mark({ class: 'cm-field-highlight' });

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '13px' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', lineHeight: 1.5 },
  '.cm-field-highlight': { backgroundColor: 'rgba(123, 97, 255, 0.22)', borderRadius: '2px' },
  '&.cm-focused': { outline: 'none' },
});

/**
 * @param {Object} props
 * @param {string} props.value
 * @param {(text: string) => void} [props.onChange]
 * @param {'json'|'yaml'|'markdown'|'text'} [props.language]
 * @param {boolean} [props.readOnly]
 * @param {string|string[]} [props.highlightKey] JSON key (or key path) to mark.
 * @param {string[]} [props.highlightKeys] several top-level JSON keys to mark; the first found is scrolled to.
 * @param {(path: (string|number)[]) => void} [props.onCursorKey] JSON only: called with the key path under the cursor when the user moves it; [] outside any key.
 * @param {number} [props.cursorDepth] how many levels of that path to report (default 2: a top-level key and the key inside it).
 * @param {React.MutableRefObject<{insert: (text: string) => void}|null>} [props.handle] receives { insert } to put text at the cursor.
 */
export default function CodeMirrorView({ value, onChange, language = 'json', readOnly = false, highlightKey, highlightKeys, onCursorKey, cursorDepth = 2, handle }) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const depthRef = useRef(cursorDepth);
  useEffect(() => { depthRef.current = cursorDepth; }, [cursorDepth]);
  const onCursorRef = useRef(onCursorKey);
  useEffect(() => { onCursorRef.current = onCursorKey; }, [onCursorKey]);

  useEffect(() => {
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(), foldGutter(), drawSelection(), highlightActiveLine(), history(),
          indentOnInput(), bracketMatching(), markField, oneDark, theme,
          // Wrap long values (prompts, descriptions) instead of scrolling sideways.
          EditorView.lineWrapping,
          keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
          ...(LANGUAGES[language] || LANGUAGES.text)(),
          EditorState.readOnly.of(readOnly),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current?.(u.state.doc.toString());
            // Only the user's own cursor moves (not our value syncs or highlight scrolls) report a key.
            if (u.selectionSet && !u.docChanged && language === 'json' && u.transactions.some((t) => t.isUserEvent('select'))) {
              onCursorRef.current?.(keyPathAt(u.state.doc.toString(), u.state.selection.main.head, depthRef.current));
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    if (handle) {
      handle.current = {
        insert: (text) => {
          const { from, to } = view.state.selection.main;
          view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length }, userEvent: 'input' });
          view.focus();
        },
      };
    }
    return () => { view.destroy(); viewRef.current = null; if (handle) handle.current = null; };
    // The editor is created once per language/readOnly; value is synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, readOnly]);

  // Apply external value changes without clobbering what the user is typing.
  useEffect(() => {
    const view = viewRef.current;
    if (view && view.state.doc.toString() !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const wanted = highlightKeys?.length ? highlightKeys : highlightKey?.length ? [highlightKey] : [];
    const ranges = language === 'json' ? wanted.map((k) => findTopLevelKey(value, k)).filter(Boolean).sort((a, b) => a.from - b.from) : [];
    view.dispatch({
      effects: [
        setMark.of(ranges.length ? Decoration.set(ranges.map((r) => mark.range(r.from, r.to))) : Decoration.none),
        ...(ranges.length ? [EditorView.scrollIntoView(ranges[0].from, { y: 'start', yMargin: 40 })] : []),
      ],
    });
    // The keys may be fresh arrays each render; compare them by content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(highlightKey), JSON.stringify(highlightKeys), value, language]);

  return <Box ref={hostRef} sx={{ height: '100%', minHeight: 0, overflow: 'hidden', '& .cm-editor': { height: '100%' } }} />;
}
