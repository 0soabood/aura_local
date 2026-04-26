import { useState, useEffect, useMemo } from 'react';
import { Component, ErrorInfo, ReactNode } from 'react';
import { Terminal, Activity, Search, Layers, FileText, Cpu } from 'lucide-react';
import CoreTerminal from './components/CoreTerminal';

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
        <div className="h-full flex flex-col items-center justify-center bg-panel gap-4 p-12 text-center">
          <span className="text-[10px] font-bold text-red-500 uppercase tracking-[0.2em]">Console Crashed</span>
          <p className="text-[10px] text-dim font-mono max-w-md leading-relaxed">{this.state.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [apiOnline, setApiOnline] = useState(true);

  return (
    <div className="app density-compact" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* HEADER */}
      <header className="app-header" style={{ flexShrink: 0 }}>
        <div className="app-header-title">
          <span className="dot live" />
          <b>AURA Shell</b>
          <span className="sep">·</span>
          <span className="sub">Minimal Autonomous Client</span>
        </div>
        <div className="app-header-meta">
          <span className="ver">v1.0.0</span>
        </div>
      </header>

      {/* MAIN */}
      <main className="app-main" style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <RootErrorBoundary>
          <CoreTerminal />
        </RootErrorBoundary>
      </main>

      {/* BOTTOM BAR */}
      <footer className="app-bottom" style={{ flexShrink: 0 }}>
        <div className="bb-seg">
          <Cpu size={11} />
          <span>System Active</span>
        </div>
        <div className="bb-seg">
          <span className={`api-status${apiOnline ? ' online' : ' offline'}`}>
            <span className={`dot${apiOnline ? ' ok' : ' err'}`} />
            API {apiOnline ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
      </footer>
    </div>
  );
}
