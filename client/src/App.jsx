/**
 * @fileoverview Main application component with MUI theme, React Query, context providers, and routing.
 */
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { QueryClient, QueryClientProvider } from 'react-query';

import { ClipboardProvider } from './contexts/ClipboardContext';
import { WorkspaceProvider } from './contexts/WorkspaceContext';
import { UnsavedChangesProvider } from './contexts/UnsavedChangesContext';
import Layout from './components/Layout/Layout';
import ErrorBoundary from './components/common/ErrorBoundary';
import Dashboard from './pages/Dashboard/Dashboard';
import Agents from './pages/Agents/Agents';
import MCPWorkbench from './pages/MCPWorkbench/MCPWorkbench';
import Steering from './pages/Steering/Steering';
import Skills from './pages/Skills/Skills';
import Changelog from './pages/Changelog/Changelog';
import Workspaces from './pages/Workspaces/Workspaces';

// QueryClient must be created outside the component to prevent
// cache destruction on every re-render
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000,
    },
  },
});

/** @returns {JSX.Element} Root application component with theme, providers, and routes */
function App() {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : true;
  });

  useEffect(() => {
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  const theme = createTheme({
    palette: {
      mode: darkMode ? 'dark' : 'light',
      primary: {
        main: '#1976d2',
        light: '#42a5f5',
        dark: '#1565c0',
      },
      secondary: {
        main: '#dc004e',
      },
      background: {
        default: darkMode ? '#121212' : '#f5f5f5',
        paper: darkMode ? '#1e1e1e' : '#ffffff',
      },
    },
    typography: {
      fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
      h4: {
        fontWeight: 600,
      },
      h5: {
        fontWeight: 600,
      },
      h6: {
        fontWeight: 600,
      },
    },
    components: {
      MuiCard: {
        styleOverrides: {
          root: {
            boxShadow: darkMode ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.1)',
            borderRadius: 8,
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            borderRadius: 6,
          },
        },
      },
    },
  });
  
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ErrorBoundary>
          <ClipboardProvider>
            <WorkspaceProvider>
            <UnsavedChangesProvider>
              <Router>
                <Layout darkMode={darkMode} setDarkMode={setDarkMode}>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/agents" element={<Agents />} />
                    <Route path="/mcp" element={<MCPWorkbench />} />
                  <Route path="/steering" element={<Steering />} />
                  <Route path="/skills" element={<Skills />} />
                  <Route path="/workspaces" element={<Workspaces />} />
                  <Route path="/changelog" element={<Changelog />} />
                </Routes>
              </Layout>
            </Router>
            </UnsavedChangesProvider>
            </WorkspaceProvider>
          </ClipboardProvider>
        </ErrorBoundary>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
