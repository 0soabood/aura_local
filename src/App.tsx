import { useState, Component, ErrorInfo, ReactNode } from 'react';
import NavigationHub from './components/NavigationHub';
import CoreTerminal from './components/CoreTerminal';
import ROIDash from './components/ROIDash';
import RoadmapView from './components/RoadmapView';
import ResearchConsole from './components/ResearchConsole';
import SystemLogs from './components/SystemLogs';

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

type View = 'hub' | 'terminal' | 'roi' | 'roadmap' | 'research' | 'logs' | 'archive';

const NAV: { key: View; n: string; label: string }[] = [
  { key: 'hub',      n: '00', label: 'HUB' },
  { key: 'terminal', n: '01', label: 'TERMINAL' },
  { key: 'roadmap',  n: '02', label: 'ROADMAP' },
  { key: 'research', n: '03', label: 'RESEARCH' },
  { key: 'roi',      n: '04', label: 'ROI' },
  { key: 'logs',     n: '05', label: 'LOGS' },
];

export default function App() {
  const [view, setView] = useState<View>('hub');

  return (
    <div className="app density-compact">
      <header className="app-bar">
        <div className="brand">
          <span className="mark">Æ</span>
          <span className="word">AURA<span className="slash">/</span>CODE</span>
        </div>
        <nav className="nav">
          {NAV.map(n => (
            <button
              key={n.key}
              className={`nav-item${view === n.key ? ' active' : ''}`}
              onClick={() => setView(n.key)}
            >
              <span className="num">{n.n}</span>{n.label}
            </button>
          ))}
        </nav>
        <div className="meta">
          <span><span className="dot live" /> LIVE</span>
        </div>
      </header>

      <RootErrorBoundary>
        {view === 'hub'      && <NavigationHub onNavigate={(v) => setView(v as View)} />}
        {view === 'terminal' && <CoreTerminal />}
        {view === 'roi'      && <ROIDash />}
        {view === 'roadmap'  && <RoadmapView />}
        {view === 'research' && <ResearchConsole />}
        {view === 'logs'     && <SystemLogs />}
        {view === 'archive'  && (
          <div className="page">
            <div className="page-body">
              <div className="empty"><div className="caps">ARCHIVE — COMING SOON</div></div>
            </div>
          </div>
        )}
      </RootErrorBoundary>
    </div>
  );
}
