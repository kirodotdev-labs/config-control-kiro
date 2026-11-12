/**
 * @fileoverview Keeps a form and a raw JSON pane in sync over one document.
 * Form edits replace the JSON text; JSON edits update the form as soon as the
 * text parses. While the text is invalid the form keeps the last valid value
 * and `error` explains what is wrong.
 */
import { useCallback, useState } from 'react';
import useDraft from './useDraft';
import { formatJson, parseJson } from '../domain/json.js';

/**
 * @param {Object|undefined} loaded the saved document.
 * @param {string} resetKey identity of the document.
 * @param {(value: any) => string} [validate] extra check on parsed JSON; returns an error or ''.
 */
export default function useJsonDocument(loaded, resetKey, validate) {
  const { draft, setDraft, dirty, markSaved } = useDraft(loaded, resetKey);
  const [typed, setTyped] = useState({ key: resetKey, text: null });
  const text = typed.key === resetKey && typed.text !== null ? typed.text : formatJson(draft);

  const parsed = typed.key === resetKey && typed.text !== null ? parseJson(typed.text) : { error: '' };
  const error = parsed.error || (parsed.value !== undefined && validate ? validate(parsed.value) : '');

  /** Form edit: replace the document (and the JSON text). */
  const setDoc = useCallback((next) => {
    setDraft(next);
    setTyped({ key: resetKey, text: null });
  }, [setDraft, resetKey]);

  /** JSON edit: keep the user's text; adopt it when it parses and validates. */
  const setText = useCallback((t) => {
    setTyped({ key: resetKey, text: t });
    const { value, error: e } = parseJson(t);
    if (!e && (!validate || !validate(value))) setDraft(value);
  }, [setDraft, resetKey, validate]);

  const saved = useCallback((doc) => {
    markSaved(doc);
    setTyped({ key: resetKey, text: null });
  }, [markSaved, resetKey]);

  return { doc: draft, setDoc, text, setText, error, dirty: dirty || !!error, markSaved: saved };
}
