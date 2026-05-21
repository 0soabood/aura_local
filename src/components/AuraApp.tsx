import React, { useState } from 'react';
import { ChatPanel } from './ChatPanel';
import { LiveNodeGraph } from './LiveNodeGraph';
import { AgentStatusPanel } from './AgentStatusPanel';
import { SessionsList } from './SessionsList';
import { SettingsPanel } from './SettingsPanel';
import { ThinkingTrace } from './ThinkingTrace';
import { ApprovalModal } from './ApprovalModal';
import {
  useIsOrchestrating,
  useActiveAgent,
  useEnergyMode,
  useBrainDumpMode,
  useSelectedModel,
  usePendingApproval,
} from '../stores/useAura';

const AGENT_LABELS: Record<string, string> = {
  research_agent: 'Research',
  code_agent: 'Code',
  synthesis_agent: 'Synthesis',
  bureaucracy_agent: 'Memory',
};

type ViewType = 'compose' | 'graph' | 'sessions' | 'settings';

export const AuraApp: React.FC = () => {
  const isOrchestrating = useIsOrchestrating();
  const activeAgent = useActiveAgent();
  const energyMode = useEnergyMode();
  const brainDumpMode = useBrainDumpMode();
  const selectedModel = useSelectedModel();
  const pendingApproval = usePendingApproval();
  const [activeView, setActiveView] = useState<ViewType>('compose');
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showTrace, setShowTrace] = useState(false);

  const statusLabel = isOrchestrating
    ? (activeAgent ? AGENT_LABELS[activeAgent] || 'Running' : 'Running')
    : 'Idle';

  const statusColor = isOrchestrating ? 'text-cyan-400' : 'text-white/30';
  const statusBg = isOrchestrating ? 'bg-cyan-500/10 border-cyan-500/30' : 'bg-white/5 border-white/10';
  const dotColor = isOrchestrating ? 'bg-cyan-400 animate-pulse' : 'bg-white/25';

  const navItems: { id: ViewType; icon: string; label: string }[] = [
    { id: 'compose', icon: '⬡', label: 'Compose' },
    { id: 'sessions', icon: '◉', label: 'Sessions' },
    { id: 'graph', icon: '◈', label: 'Graph' },
    { id: 'settings', icon: '⚙', label: 'Settings' },
  ];

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0a0a14] text-white overflow-hidden font-sans select-none">
      {/* ════════════════════════════════════════ */}
      {/* TOP BAR                                  */}
      {/* ════════════════════════════════════════ */}
      <header className="flex items-center justify-between px-5 py-2.5 bg-[#0d0d1a]/90 backdrop-blur-xl border-b border-white/5 shrink-0">
        {/* Left: Logo + title */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setActiveView('compose'); setShowRightPanel(true); }}
            className="text-lg font-bold bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent hover:opacity-80 transition-opacity cursor-pointer"
            title="Reset to compose view"
          >
            ⬡ AURA
          </button>
          {/* Workspace badge */}
          <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono border border-white/5 bg-white/[0.02] text-white/20">
            📁 workspace
          </span>
          {/* Status chip — non-interactive */}
          <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono border ${statusBg} ${statusColor} pointer-events-none select-none`}>
            <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
            {statusLabel}
          </div>
          {/* Mode indicators */}
          {brainDumpMode && (
            <span className="text-[10px] font-mono text-amber-400/60">🧠 brain dump</span>
          )}
          {energyMode === 'low' && (
            <span className="text-[10px] font-mono text-white/20">⚡ low</span>
          )}
          {selectedModel && selectedModel !== 'auto' && (
            <span className="text-[10px] font-mono text-purple-400/50 truncate max-w-[160px]" title={selectedModel}>
              {selectedModel.split(':').pop()}
            </span>
          )}
        </div>

        {/* Right: Toggle right panel */}
        <button
          onClick={() => setShowRightPanel(p => !p)}
          className="text-[10px] font-mono text-white/25 hover:text-white/50 transition-colors px-2 py-1 rounded border border-white/5 hover:border-white/15"
        >
          {showRightPanel ? '▣ dual' : '▢ single'}
        </button>
      </header>

      {/* ════════════════════════════════════════ */}
      {/* MAIN LAYOUT: 3-pane                      */}
      {/* ════════════════════════════════════════ */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── LEFT RAIL (icon nav) ── */}
        <nav className="w-[52px] flex flex-col items-center py-3 gap-1 bg-[#0d0d1a] border-r border-white/5 shrink-0">
          {/* Logo — clickable to reset */}
          <button
            onClick={() => { setActiveView('compose'); setShowRightPanel(true); }}
            className="w-8 h-8 flex items-center justify-center mb-3 text-indigo-400/60 text-sm hover:text-indigo-400 transition-colors"
            title="Reset view"
          >
            ⬡
          </button>

          {/* Nav icons */}
          {navItems.map(item => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm transition-all ${
                  isActive
                    ? 'bg-indigo-500/20 text-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.2)]'
                    : 'text-white/25 hover:text-white/50 hover:bg-white/[0.03]'
                }`}
                title={item.label}
              >
                {item.icon}
              </button>
            );
          })}

          {/* Spacer */}
          <div className="flex-1" />

          {/* System health dot */}
          <div className="w-2 h-2 rounded-full bg-green-400/60 mb-2" title="All systems operational" />
        </nav>

        {/* ── SECONDARY LEFT PANEL ── */}
        {activeView === 'sessions' && (
          <div className="w-[280px] min-w-[240px] border-r border-white/5 bg-[#0d0d1a] flex flex-col shrink-0">
            <SessionsList onClose={() => setActiveView('compose')} />
          </div>
        )}
        {activeView === 'settings' && (
          <div className="w-[300px] min-w-[260px] border-r border-white/5 bg-[#0d0d1a] flex flex-col shrink-0">
            <SettingsPanel onClose={() => setActiveView('compose')} />
          </div>
        )}

        {/* ── CENTER: Orchestration Composer ── */}
        <div className="flex-1 flex flex-col bg-[#0a0a14] min-w-0">
          <ChatPanel />
        </div>

        {/* ── RIGHT PANEL: Graph + Agent Status ── */}
        {showRightPanel && (
          <div className="w-[340px] min-w-[280px] border-l border-white/5 flex flex-col shrink-0 bg-[#0d0d1a]">
            {/* Graph (top half) */}
            <div className="flex-1 min-h-0 flex flex-col border-b border-white/5">
              <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between shrink-0">
                <span className="text-xs font-mono text-white/40 tracking-wider">AGENT GRAPH</span>
                {isOrchestrating && (
                  <span className="flex items-center gap-1.5 text-[10px] font-mono text-cyan-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    LIVE
                  </span>
                )}
              </div>
              <div className="flex-1 min-h-0">
                <LiveNodeGraph />
              </div>
            </div>
            {/* Agent states / Thinking Trace (bottom half) */}
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex items-center border-b border-white/[0.04] shrink-0">
                <button
                  onClick={() => setShowTrace(false)}
                  className={`flex-1 py-1.5 text-[8px] font-mono uppercase tracking-wider transition-colors ${
                    !showTrace
                      ? 'text-indigo-400/70 border-b border-indigo-500/30 bg-indigo-500/[0.04]'
                      : 'text-white/15 hover:text-white/30'
                  }`}
                >
                  Agent Status
                </button>
                <button
                  onClick={() => setShowTrace(true)}
                  className={`flex-1 py-1.5 text-[8px] font-mono uppercase tracking-wider transition-colors ${
                    showTrace
                      ? 'text-indigo-400/70 border-b border-indigo-500/30 bg-indigo-500/[0.04]'
                      : 'text-white/15 hover:text-white/30'
                  }`}
                >
                  Thinking Trace
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                {showTrace ? <ThinkingTrace /> : <AgentStatusPanel />}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════ */}
      {/* BOTTOM STATUS BAR                        */}
      {/* ════════════════════════════════════════ */}
      <footer className="flex items-center justify-between px-5 py-1.5 bg-[#0d0d1a]/90 backdrop-blur-xl border-t border-white/5 shrink-0">
        <div className="flex items-center gap-3 text-[10px] font-mono text-white/20">
          <span className="text-indigo-400/50">AURA</span>
          <span className="text-white/10">·</span>
          <span>ReAct Loops</span>
          <span className="text-white/10">·</span>
          <span>Multi-Provider Routing</span>
          <span className="text-white/10">·</span>
          <span>190+ Tests</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono text-white/20">
          <span className="text-green-400/50">●</span>
          <span>All Systems Operational</span>
        </div>
      </footer>
      {/* Approval modal overlay */}
      {pendingApproval && <ApprovalModal action={pendingApproval} />}
    </div>
  );
};
