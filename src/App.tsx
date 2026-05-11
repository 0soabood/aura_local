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
        <div className="page" style={{ justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ textAlign: 'center', padding: 48 }}>
            <span className="tag danger" style={{ marginBottom: 12, display: 'inline-block' }}>CONSOLE CRASHED</span>
            <p className="mono" style={{ fontSize: 11, color: 'var(--text-2)', maxWidth: 480, lineHeight: 1.6 }}>
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
