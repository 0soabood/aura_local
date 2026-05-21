import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AuraApp } from './components/AuraApp';

// ── Error boundary ────────────────────────────────────────────────────────────

interface ErrorBoundaryState { hasError: boolean; message: string }

class RootErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(err: Error): ErrorBoundaryState {
    return { hasError: true, message: err.message };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('[RootErrorBoundary]', err, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          backgroundColor: '#0a0a14',
          color: '#e2e8f0',
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          <div style={{ textAlign: 'center', padding: 48 }}>
            <span style={{
              display: 'inline-block',
              padding: '0.25rem 0.75rem',
              borderRadius: '4px',
              backgroundColor: 'rgba(244, 63, 94, 0.15)',
              color: '#f43f5e',
              fontSize: '0.7rem',
              fontWeight: 600,
              marginBottom: '12px',
              border: '1px solid rgba(244, 63, 94, 0.3)',
            }}>
              CONSOLE CRASHED
            </span>
            <p style={{
              fontSize: '0.7rem',
              color: '#94a3b8',
              maxWidth: 480,
              lineHeight: 1.6,
              margin: 0,
            }}>
              {this.state.message}
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <RootErrorBoundary>
      <AuraApp />
    </RootErrorBoundary>
  );
}
