/**
 * @fileoverview Protects unsaved edits. The open editor reports whether it is
 * dirty; anything that would replace it (picking another item, switching
 * scope) asks first via confirmLeave(). Ctrl/Cmd+S and the browser's
 * leave-page warning are wired here too.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { useConfirm } from '../ui/ConfirmProvider';

const UnsavedChangesContext = createContext(null);

/** @param {{children: React.ReactNode}} props */
export function UnsavedChangesProvider({ children }) {
  const dirtyRef = useRef(false);
  const confirm = useConfirm();

  useEffect(() => {
    const warn = (e) => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const confirmLeave = useCallback(async () => {
    if (!dirtyRef.current) return true;
    const ok = await confirm({
      title: 'Discard your changes?',
      body: 'You have unsaved changes. If you leave now, they will be lost.',
      confirmLabel: 'Discard changes', cancelLabel: 'Keep editing', danger: true,
    });
    if (ok) dirtyRef.current = false;
    return ok;
  }, [confirm]);

  const value = useMemo(() => ({ dirtyRef, confirmLeave }), [confirmLeave]);
  return <UnsavedChangesContext.Provider value={value}>{children}</UnsavedChangesContext.Provider>;
}

/** @returns {() => Promise<boolean>} resolves true when it is fine to leave the editor. */
export const useConfirmLeave = () => useContext(UnsavedChangesContext).confirmLeave;

/**
 * Registers the open editor's dirty state and binds Ctrl/Cmd+S to save.
 * @param {{dirty: boolean, canSave: boolean, onSave: () => void}} opts
 */
export function useEditorGuard({ dirty, canSave, onSave }) {
  const { dirtyRef } = useContext(UnsavedChangesContext);
  useEffect(() => {
    dirtyRef.current = dirty;
    return () => { dirtyRef.current = false; };
  }, [dirty, dirtyRef]);

  const saveRef = useRef(onSave);
  useEffect(() => { saveRef.current = canSave ? onSave : null; }, [canSave, onSave]);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveRef.current?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
