/**
 * @fileoverview Keeps a form and a text pane in sync over one document: the
 * text. Form edits write the new value into the text (so the writer can keep
 * comments and layout); text edits update the form as soon as the text reads.
 * While it doesn't, the form keeps the last good value and `error` says why.
 * Used for permissions.yaml and workflow recipes.
 */
import { useCallback, useMemo, useRef } from 'react';
import useDraft from './useDraft';

/**
 * @template T
 * @param {string|undefined} loaded the saved text ('' when the file doesn't exist yet).
 * @param {string} resetKey identity of the file.
 * @param {(text: string) => {value: T|null, error: string}} read
 * @param {(text: string, value: T) => string} write
 * @returns {{text: string, setText: (t: string) => void, value: T|null, setValue: (v: T) => void, error: string, dirty: boolean, markSaved: (t: string) => void}}
 */
export default function useTextDocument(loaded, resetKey, read, write) {
  const { draft, setDraft, dirty, markSaved } = useDraft(loaded, resetKey);
  const text = draft ?? '';
  const parsed = useMemo(() => read(text), [text, read]);
  // The last value that read cleanly, shown while the text is broken.
  const good = useRef({ key: resetKey, value: null });
  if (good.current.key !== resetKey) good.current = { key: resetKey, value: null };
  if (!parsed.error) good.current.value = parsed.value;

  /** Form edit: write the value into the text. */
  const setValue = useCallback((next) => setDraft((t) => write(t ?? '', next)), [setDraft, write]);

  return { text, setText: setDraft, value: parsed.error ? good.current.value : parsed.value, setValue, error: parsed.error, dirty, markSaved };
}
