import { useState } from 'react';
import { Component, ErrorInfo, ReactNode } from 'react';
import { motion } from 'motion/react';
import { Terminal, Activity, Search, Layers, FileText, Cpu, ChevronLeft } from 'lucide-react';
import CoreTerminal from './components/CoreTerminal';
import ROIDash from './components/ROIDash';
import RoadmapView from './components/RoadmapView';
import ResearchConsole from './components/ResearchConsole';
import SystemLogs from './components/SystemLogs';
import NavigationHub from './components/NavigationHub';

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

// ── View metadata ─────────────────────────────────────────────────────────────

const VIEW_META: Record<string, { label: string; icon: React.ComponentType<{ size?: number }> }> = {
  terminal: { label: 'AURA Terminal', icon: Terminal },
  roi:      { label: 'ROI Dashboard', icon: Activity },
  roadmap:  { label: 'Roadmap',       icon: Layers },
  research: { label: 'Research Console', icon: Search },
  logs:     { label: 'System Logs',   icon: FileText },
};

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [activeView, setActiveView] = useState<string | null>(null);

  const meta = activeView ? VIEW_META[activeView] : null;

  return (
    <div className="app density-compact" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* HEADER */}
      <header className="app-header" style={{ flexShrink: 0 }}>
        <div className="app-header-title">
          <span className="dot live" />
          <b>AURA Shell</b>
          {meta && (
            <>
              <span className="sep">·</span>
              {meta.icon && <meta.icon size={10} />}
              <span className="sub">{meta.label}</span>
            </>
          )}
          {!meta && (
            <>
              <span className="sep">·</span>
              <span className="sub">Minimal Autonomous Client</span>
            </>
          )}
        </div>
        <div className="app-header-meta">
          <span className="ver">v1.0.0</span>
        </div>
      </header>

      {/* MAIN */}
      <main className="app-main" style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <RootErrorBoundary>
          {activeView === null ? (
            <NavigationHub onNavigate={setActiveView} />
          ) : (
            <>
              {/* back button */}
              <motion.button
                className="hub-back-btn"
                onClick={() => setActiveView(null)}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <ChevronLeft size={11} />
                Hub
              </motion.button>

              {activeView === 'terminal'  && <CoreTerminal />}
              {activeView === 'roi'       && <ROIDash />}
              {activeView === 'roadmap'   && <RoadmapView />}
              {activeView === 'research'  && <ResearchConsole />}
              {activeView === 'logs'      && <SystemLogs />}
            </>
          )}
        </RootErrorBoundary>
      </main>

      {/* BOTTOM BAR */}
      <footer className="app-bottom" style={{ flexShrink: 0 }}>
        <div className="bb-seg">
          <Cpu size={11} />
          <span>System Active</span>
        </div>
        <div className="bb-seg">
          <span className="api-status online">
            <span className="dot ok" />
            API ONLINE
          </span>
        </div>
      </footer>
    </div>
  );
}
