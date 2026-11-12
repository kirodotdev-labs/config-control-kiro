/**
 * @fileoverview Contains a render failure to the part of the screen that
 * failed. `fallback` may be a node or (error) => node; the boundary resets when
 * any of `resetKeys` changes (e.g. the user opens another item).
 */
import { Component } from 'react';
import { Alert, AlertTitle } from '@mui/material';

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Render failed:', error, info?.componentStack);
  }

  componentDidUpdate(prev) {
    const a = prev.resetKeys || [];
    const b = this.props.resetKeys || [];
    if (this.state.error && (a.length !== b.length || a.some((k, i) => k !== b[i]))) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { fallback } = this.props;
    if (fallback) return typeof fallback === 'function' ? fallback(error) : fallback;
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        <AlertTitle>Something went wrong showing this view</AlertTitle>
        Your files have not changed. Reload the page to try again.
        {import.meta.env.DEV && <pre style={{ whiteSpace: 'pre-wrap' }}>{String(error.stack || error)}</pre>}
      </Alert>
    );
  }
}
