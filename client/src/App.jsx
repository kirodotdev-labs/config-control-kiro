/**
 * @fileoverview Root component: providers (data cache, theme, motion,
 * dialogs, toasts, scope, unsaved-changes guard) around the app shell.
 */
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LazyMotion, domAnimation } from 'motion/react';
import { WorkspaceProvider } from './contexts/WorkspaceContext';
import { UnsavedChangesProvider } from './contexts/UnsavedChangesContext';
import { ConfirmProvider } from './ui/ConfirmProvider';
import { NotifyProvider } from './ui/NotifyProvider';
import ErrorBoundary from './ui/ErrorBoundary';
import { buildTheme } from './theme';
import { AppShell } from './features/shell/AppShell';
import { ConfigurationView } from './features/shell/ConfigurationView';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 60 * 1000 } },
});
const theme = buildTheme();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <LazyMotion features={domAnimation} strict>
          <ErrorBoundary>
            <NotifyProvider>
              <ConfirmProvider>
                <WorkspaceProvider>
                  <UnsavedChangesProvider>
                    <AppShell>
                      <ConfigurationView />
                    </AppShell>
                  </UnsavedChangesProvider>
                </WorkspaceProvider>
              </ConfirmProvider>
            </NotifyProvider>
          </ErrorBoundary>
        </LazyMotion>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
