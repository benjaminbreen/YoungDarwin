// components/ErrorBoundary.jsx
// React Error Boundary to catch and handle component errors gracefully

import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error to console with full details
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Save error details to state
    this.setState({
      error,
      errorInfo
    });

    // You could also log the error to an error reporting service here
  }

  handleReset = () => {
    // Reset the error boundary and try to recover
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });

    // Try to reload the game state
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      // Render fallback UI
      return (
        <div style={{
          padding: '2rem',
          maxWidth: '800px',
          margin: '2rem auto',
          backgroundColor: '#2a2a2a',
          color: '#e8d4a2',
          borderRadius: '8px',
          fontFamily: 'Georgia, serif',
          border: '2px solid #5a4a3a'
        }}>
          <h1 style={{
            fontSize: '1.8rem',
            marginBottom: '1rem',
            color: '#ff6b6b'
          }}>
            ⚠️ An Unexpected Error Occurred
          </h1>

          <p style={{
            fontSize: '1.1rem',
            lineHeight: '1.6',
            marginBottom: '1.5rem'
          }}>
            The Young Darwin expedition has encountered an unexpected problem.
            Your game progress may have been affected.
          </p>

          <div style={{
            backgroundColor: '#1a1a1a',
            padding: '1rem',
            borderRadius: '4px',
            marginBottom: '1.5rem',
            fontSize: '0.9rem',
            fontFamily: 'monospace',
            overflow: 'auto',
            maxHeight: '200px'
          }}>
            <strong>Error Details:</strong>
            <pre style={{ margin: '0.5rem 0', whiteSpace: 'pre-wrap' }}>
              {this.state.error && this.state.error.toString()}
            </pre>
            {this.state.errorInfo && (
              <details style={{ marginTop: '0.5rem' }}>
                <summary style={{ cursor: 'pointer', color: '#a0a0a0' }}>
                  Stack Trace
                </summary>
                <pre style={{
                  marginTop: '0.5rem',
                  fontSize: '0.8rem',
                  whiteSpace: 'pre-wrap',
                  color: '#808080'
                }}>
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <button
              onClick={this.handleReset}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#6a8a6a',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontFamily: 'Georgia, serif'
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#7a9a7a'}
              onMouseOut={(e) => e.target.style.backgroundColor = '#6a8a6a'}
            >
              Reload Game
            </button>

            <button
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.localStorage.clear();
                  window.location.reload();
                }
              }}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#8a6a6a',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontFamily: 'Georgia, serif'
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#9a7a7a'}
              onMouseOut={(e) => e.target.style.backgroundColor = '#8a6a6a'}
            >
              Clear Save & Restart
            </button>
          </div>

          <p style={{
            fontSize: '0.9rem',
            marginTop: '1.5rem',
            color: '#a0a0a0'
          }}>
            If this problem persists, please report it to the development team with
            the error details shown above.
          </p>
        </div>
      );
    }

    // Normally, just render children
    return this.props.children;
  }
}

export default ErrorBoundary;
