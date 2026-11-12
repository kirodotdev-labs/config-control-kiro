/**
 * @fileoverview App-wide toast notifications: const notify = useNotify();
 * notify('Saved', 'success').
 */
import { createContext, useCallback, useContext, useState } from 'react';
import { Alert, Snackbar } from '@mui/material';

const NotifyContext = createContext(null);

/** @param {{children: React.ReactNode}} props */
export function NotifyProvider({ children }) {
  const [toast, setToast] = useState(null);
  const notify = useCallback((message, severity = 'info') => setToast({ message, severity, key: Date.now() }), []);
  const close = (_, reason) => { if (reason !== 'clickaway') setToast(null); };

  return (
    <NotifyContext.Provider value={notify}>
      {children}
      <Snackbar
        key={toast?.key} open={!!toast} onClose={close}
        autoHideDuration={toast?.severity === 'error' ? 8000 : 3000}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert onClose={close} severity={toast?.severity || 'info'} variant="filled" sx={{ maxWidth: 480 }}>
          {toast?.message}
        </Alert>
      </Snackbar>
    </NotifyContext.Provider>
  );
}

/** @returns {(message: string, severity?: 'success'|'info'|'warning'|'error') => void} */
export const useNotify = () => useContext(NotifyContext);
