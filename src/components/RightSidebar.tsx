import React, { useState } from 'react';
import { SettingsPanel } from './SettingsPanel';
import {
  useSessions, useActiveSession, useFetchSessions, useCreateSession, useSelectSession,
  useRoadmapItems, useFetchRoadmapItems, useRoadmapStats,
  useStats, useFetchStats,
  useClearChat,
  useAgentEvents, useActiveAgent, useIsOrchestrating,
} from '../stores/useAura';
import { RoadmapItem } from '../shared/types';

const AGENT_COLORS: Record<string, string> = {
  research_agent: '#22d3ee',
  code_agent: '#a855f7',
  synthesis_agent: '#22c55e',
  bureaucracy_agent: '#f59e0b',
  orchestrator: '#6366f1',
};

const AGENT_LABELS: Record<string, string> = {
  research_agent: 'Research',
  code_agent: 'Code',
  synthesis_agent: 'Synthesis',
  bureaucracy_agent: 'Bureaucracy',
  orchestrator: 'Orchestrator',
};

// ── Sessions Panel (Redesigned) ──
const SessionsPanel: React.FC = () => {
  const sessions = useSessions();
  const activeSession = useActiveSession();
  const fetchSessions = useFetchSessions();
  const createSession = useCreateSession();
  const selectSession = useSelectSession();
  const clearChat = useClearChat();

  React.useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const statusConfig: Record<string, { color: string; bg: string; border: string; label: string }> = {
    running: { color: 'text-cyan-400', bg: 'bg-cyan-500/[0.08]', border: 'border-cyan-500/20', label: 'RUN' },
    idle: { color: 'text-white/25', bg: 'bg-white/[0.03]', border: 'border-white/[0.06]', label: 'IDLE' },
    completed: { color: 'text-green-400', bg: 'bg-green-500/[0.08]', border: 'border-green-500/20', label: 'DONE' },
    error: { color: 'text-red-400', bg: 'bg-red-500/[0.08]', border: 'border-red-500/20', label: 'ERR' },
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-white/[0.04] flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-widest text-white/30">Sessions</span>
        <button
          onClick={async () => { clearChat(); await createSession(); await fetchSessions(); }}
          className="text-[10px] font-mono text-indigo-400/60 hover:text-indigo-400 transition-colors px-2 py-0.5 rounded hover:bg-indigo-500/10"
        >
          + New
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 && (
          <div className="px-3 py-8 text-center text-xs text-white/15">No sessions yet</div>
        )}
        {sessions.map((s) => {
          const isActive = activeSession === s.id;
          const st = (s.state || 'idle').toLowerCase();
          const status = statusConfig[st] || statusConfig.idle;

          return (
            <button
              key={s.id}
              onClick={() => { selectSession(s.id); clearChat(); }}
              className={`w-full text-left px-3 py-2.5 border-b border-white/[0.02] transition-all ${
                isActive
                  ? 'bg-indigo-500/[0.06] border-l-2 border-l-indigo-500'
                  : 'hover:bg-white/[0.01]'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="text-xs text-white/60 truncate font-medium">
                  {s.title || s.id.slice(0, 8)}
                </div>
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-mono border shrink-0 ${status.bg} ${status.color} ${status.border}`}>
                  {status.label}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-white/15">{formatDate(s.updated_at)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ── Agent Status Panel ──
const AgentStatusPanel: React.FC = () => {
  const activeAgent = useActiveAgent();
  const isOrchestrating = useIsOrchestrating();
  const agentEvents = useAgentEvents();
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const agents = [
    { id: 'research_agent', role: 'Research', desc: 'Web search, analysis' },
    { id: 'code_agent', role: 'Code', desc: 'Implementation, testing' },
    { id: 'synthesis_agent', role: 'Synthesis', desc: 'Summarization, writing' },
    { id: 'bureaucracy_agent', role: 'Bureaucracy', desc: 'Admin, scheduling' },
  ];

  const toggleAgent = (id: string) => {
    setExpandedAgent(prev => (prev === id ? null : id));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-white/[0.04]">
        <span className="text-[10px] font-mono uppercase tracking-widest text-white/30">Agent Status</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
        {agents.map(agent => {
          const isActive = isOrchestrating && activeAgent === agent.id;
          const color = AGENT_COLORS[agent.id];
          const lastEvent = agentEvents.filter(e => e.agent === agent.id).pop();
          const isExpanded = expandedAgent === agent.id;
          const agentHistory = agentEvents.filter(e => e.agent === agent.id).slice(-5).reverse();

          return (
            <div key={agent.id}>
              <button
                onClick={() => toggleAgent(agent.id)}
                className={`w-full text-left rounded-lg px-2.5 py-2 transition-all ${
                  isActive
                    ? 'bg-white/[0.04] border border-white/[0.08]'
                    : 'bg-white/[0.01] border border-white/[0.03] hover:bg-white/[0.03]'
                }`}
                title="Click to view agent history"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full" style={{
                    backgroundColor: isActive ? color : `${color}40`,
                    boxShadow: isActive ? `0 0 8px ${color}60` : 'none',
                  }} />
                  <span className="text-xs font-medium text-white/60">{agent.role}</span>
                  {isActive && (
                    <span className="text-[8px] font-mono text-cyan-400/60 ml-auto">ACTIVE</span>
                  )}
                  {!isActive && (
                    <span className={`text-white/15 text-xs ml-auto transition-transform ${isExpanded ? 'rotate-90' : ''}`}>›</span>
                  )}
                </div>
                <div className="text-[9px] text-white/20 pl-4">{agent.desc}</div>
                {lastEvent && (
                  <div className="text-[9px] font-mono text-white/15 mt-1 pl-4 truncate">
                    {lastEvent.content.slice(0, 50)}
                  </div>
                )}
              </button>
              {isExpanded && agentHistory.length > 0 && (
                <div className="mt-1 ml-2 pl-2 border-l border-white/[0.04] space-y-0.5">
                  {agentHistory.map((evt, i) => (
                    <div
                      key={`${agent.id}-evt-${i}`}
                      className="text-[8px] font-mono text-white/20 px-1.5 py-0.5 rounded bg-white/[0.01]"
                    >
                      <span className="opacity-40">[{evt.type}]</span>{' '}
                      {evt.content.slice(0, 60)}{evt.content.length > 60 ? '…' : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Roadmap Panel ──
const RoadmapPanel: React.FC = () => {
  const items = useRoadmapItems();
  const stats = useRoadmapStats();
  const fetchRoadmapItems = useFetchRoadmapItems();

  React.useEffect(() => { fetchRoadmapItems(); }, [fetchRoadmapItems]);

  const statusColors: Record<string, string> = {
    done: 'text-green-400',
    in_progress: 'text-amber-400',
    todo: 'text-cyan-400',
    backlog: 'text-white/25',
    archived: 'text-white/15',
  };

  const laneColors: Record<string, string> = {
    build: '#a855f7',
    research: '#22d3ee',
    ship: '#22c55e',
    meta: '#f59e0b',
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-white/[0.04] flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase tracking-widest text-white/30">Roadmap</span>
        <span className="text-[9px] font-mono text-white/15">{stats.done}/{stats.total} done</span>
      </div>

      {/* Progress bar */}
      <div className="px-3 py-2 border-b border-white/[0.03]">
        <div className="h-1 rounded-full bg-white/[0.04] overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all"
            style={{ width: `${stats.total > 0 ? (stats.done / stats.total) * 100 : 0}%` }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {items.length === 0 && (
          <div className="px-3 py-8 text-center text-xs text-white/15">No roadmap items</div>
        )}
        {items
          .sort((a, b) => b.priority - a.priority)
          .map((item: RoadmapItem) => (
            <div key={item.id} className="px-3 py-2 border-b border-white/[0.02]">
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs text-white/50 flex-1">{item.title}</div>
                <span className={`text-[8px] font-mono ${statusColors[item.status] || 'text-white/20'}`}>
                  {item.status.replace('_', ' ')}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: laneColors[item.lane] || '#6366f1' }} />
                  <span className="text-[8px] text-white/15">{item.lane}</span>
                </div>
                <span className="text-[8px] text-white/10">P:{item.priority}</span>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};

// ── Memory Panel ──
const MemoryPanel: React.FC = () => {
  const [memoryContent, setMemoryContent] = useState<string>('');
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    const loadMemory = async () => {
      try {
        const res = await fetch('/api/memory');
        if (res.ok) {
          const data = await res.json();
          setMemoryContent(data.user || data.soul || 'No memory files found');
        }
      } catch {
        setMemoryContent('Failed to load memory files');
      } finally {
        setLoading(false);
      }
    };
    loadMemory();
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-white/[0.04]">
        <span className="text-[10px] font-mono uppercase tracking-widest text-white/30">Memory</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="text-xs text-white/15">Loading...</div>
        ) : (
          <pre className="text-[10px] text-white/40 font-mono whitespace-pre-wrap leading-relaxed">
            {memoryContent}
          </pre>
        )}
      </div>
    </div>
  );
};

// ── Telemetry Panel ──
const TelemetryPanel: React.FC = () => {
  const stats = useStats();
  const fetchStats = useFetchStats();

  React.useEffect(() => { fetchStats(); }, [fetchStats]);

  const metrics = stats as any;

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-white/[0.04]">
        <span className="text-[10px] font-mono uppercase tracking-widest text-white/30">Telemetry</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {!metrics ? (
          <div className="text-xs text-white/15">Loading metrics...</div>
        ) : (
          <>
            <MetricCard label="Tasks Completed" value={metrics.tasksCompleted?.toString() || '0'} color="text-green-400" />
            <MetricCard label="Execution Velocity" value={metrics.executionVelocity?.toString() || '0'} color="text-cyan-400" suffix="/week" />
            <MetricCard label="System Health" value={`${metrics.systemHealth?.toFixed(0) || '100'}%`} color="text-purple-400" />
            <MetricCard label="Research Density" value={metrics.researchDensity?.toString() || '0'} color="text-amber-400" />
            <MetricCard label="Total Value Signal" value={metrics.totalValueSignal?.toFixed(0) || '0'} color="text-indigo-400" />

            {metrics.recentActivity && metrics.recentActivity.length > 0 && (
              <div className="pt-2">
                <div className="text-[9px] font-mono text-white/20 mb-2">RECENT ACTIVITY (7D)</div>
                <div className="flex items-end gap-0.5 h-12">
                  {metrics.recentActivity.map((d: { day: string; count: number }, i: number) => {
                    const maxCount = Math.max(...metrics.recentActivity.map((a: { day: string; count: number }) => a.count), 1);
                    const height = Math.max(4, (d.count / maxCount) * 100);
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                        <div
                          className="w-full rounded-sm bg-indigo-500/30 min-h-[4px] transition-all"
                          style={{ height: `${height}%` }}
                        />
                        <span className="text-[7px] text-white/15">{d.day?.slice(5)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const MetricCard: React.FC<{ label: string; value: string; color: string; suffix?: string }> = ({ label, value, color, suffix }) => (
  <div className="flex items-center justify-between">
    <span className="text-[9px] font-mono text-white/20">{label}</span>
    <span className={`text-sm font-mono ${color}`}>{value}{suffix && <span className="text-[8px] text-white/15 ml-0.5">{suffix}</span>}</span>
  </div>
);

// ── Right Sidebar (Tabbed) ──
const panels = [
  { id: 'sessions', label: 'Sessions', component: SessionsPanel, icon: '💬' },
  { id: 'agents', label: 'Agents', component: AgentStatusPanel, icon: '⬡' },
  { id: 'roadmap', label: 'Roadmap', component: RoadmapPanel, icon: '📋' },
  { id: 'memory', label: 'Memory', component: MemoryPanel, icon: '🧠' },
  { id: 'telemetry', label: 'Telemetry', component: TelemetryPanel, icon: '📊' },
  { id: 'settings', label: 'Settings', component: SettingsPanel, icon: '⚙️' },
];

export const RightSidebar: React.FC = () => {
  const [activeTab, setActiveTab] = useState('sessions');
  const ActivePanel = panels.find(p => p.id === activeTab)?.component || SessionsPanel;

  return (
    <div className="flex flex-col h-full bg-[#0d0d1a]">
      {/* Tab bar */}
      <div className="flex border-b border-white/[0.04]">
        {panels.map(p => (
          <button
            key={p.id}
            onClick={() => setActiveTab(p.id)}
            className={`flex-1 py-2 text-[9px] font-mono transition-colors ${
              activeTab === p.id
                ? 'text-indigo-400/70 border-b border-indigo-500/30 bg-indigo-500/[0.04]'
                : 'text-white/15 hover:text-white/30'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {/* Panel content */}
      <div className="flex-1 overflow-hidden">
        <ActivePanel />
      </div>
    </div>
  );
};
