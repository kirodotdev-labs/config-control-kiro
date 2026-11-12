/**
 * @fileoverview Local edit state for a document loaded from the server.
 * The draft resets whenever the loaded value or resetKey changes, and `dirty`
 * compares serialised JSON, so reordering counts as a change.
 */
import { useCallback, useState } from 'react';
import { sameJson } from '../domain/json.js';

/**
 * @template T
 * @param {T|undefined} loaded the server's copy (undefined while loading).
 * @param {string} [resetKey] identity of the document (e.g. agent id).
 * @returns {{draft: T|undefined, setDraft: (next: T|((prev: T) => T)) => void, dirty: boolean, markSaved: (saved: T) => void}}
 */
export default function useDraft(loaded, resetKey = '') {
  const [state, setState] = useState({ base: loaded, key: resetKey, draft: loaded });

  // Adopt a new server copy or a different document (React's "reset state on
  // prop change" pattern, done during render so there is no stale frame).
  let current = state;
  if (state.key !== resetKey || (!sameJson(state.base, loaded) && sameJson(state.base, state.draft))) {
    current = { base: loaded, key: resetKey, draft: loaded };
    setState(current);
  }

  const setDraft = useCallback((next) => setState((s) => ({
    ...s, draft: typeof next === 'function' ? next(s.draft) : next,
  })), []);
  const markSaved = useCallback((saved) => setState((s) => ({ ...s, base: saved, draft: saved })), []);

  return { draft: current.draft, setDraft, dirty: !sameJson(current.base, current.draft), markSaved };
}
