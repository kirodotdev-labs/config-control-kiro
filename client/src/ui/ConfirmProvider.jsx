/**
 * @fileoverview One confirmation dialog for the whole app, used as a promise:
 *   if (await confirm({ title, body, confirmLabel, danger })) { ... }
 */
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';

const ConfirmContext = createContext(null);

/** @param {{children: React.ReactNode}} props */
export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback((opts) => new Promise((resolve) => {
    resolveRef.current = resolve;
    setRequest(opts);
  }), []);

  const close = (answer) => {
    resolveRef.current?.(answer);
    resolveRef.current = null;
    setRequest(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={!!request} onClose={() => close(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{request?.title}</DialogTitle>
        {request?.body && (
          <DialogContent><DialogContentText>{request.body}</DialogContentText></DialogContent>
        )}
        <DialogActions>
          <Button onClick={() => close(false)}>{request?.cancelLabel || 'Cancel'}</Button>
          <Button autoFocus variant="contained" color={request?.danger ? 'error' : 'primary'} onClick={() => close(true)}>
            {request?.confirmLabel || 'OK'}
          </Button>
        </DialogActions>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

/** @returns {(opts: {title: string, body?: string, confirmLabel?: string, cancelLabel?: string, danger?: boolean}) => Promise<boolean>} */
export const useConfirm = () => useContext(ConfirmContext);
