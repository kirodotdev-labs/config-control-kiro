/**
 * @fileoverview Error Boundary Component - Catches and displays React errors gracefully
 * @llm-purpose Wrap components to prevent crashes, show user-friendly error messages
 * @dependencies React class component, Material-UI Alert
 * @patterns Wrap around components that might throw errors
 * @usage <ErrorBoundary>components that might fail</ErrorBoundary>
 */

import React from 'react';
import { Alert, AlertTitle } from '@mui/material';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error,
      errorInfo
    });
    
    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <Alert severity="error" sx={{ m: 2 }}>
          <AlertTitle>Something went wrong</AlertTitle>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details style={{ whiteSpace: 'pre-wrap' }}>
              <summary>Error details (development only)</summary>
              {this.state.error.toString()}
              <br />
              {this.state.errorInfo.componentStack}
            </details>
          )}
          {process.env.NODE_ENV === 'production' && (
            <div>
              Please refresh the page. If the problem persists, contact support.
            </div>
          )}
        </Alert>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
