import React, { useState } from 'react';
import { useActiveAgent, useIsOrchestrating, useAgentEvents, useAgentBids } from '../stores/useAura';

interface AgentDef {
  id: string;
  name: string;
  icon: string;
  color: string;
}

const AGENTS: AgentDef[] = [
  { id: 'research_agent', name: 'Research', icon: '🔍', color: '#22d3ee' },
  { id: 'code_agent', name: 'Code', icon: '⌨️', color: '#a855f7' },
  { id: 'synthesis_agent', name: 'Synthesis', icon: '🧠', color: '#22c55e' },
  { id: 'bureaucracy_agent', name: 'Memory', icon: '💾', color: '#f59e0b' },
];

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 10000) return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export const AgentStatusPanel: React.FC = () => {
  const activeAgent = useActiveAgent();
  const isOrchestrating = useIsOrchestrating();
  const agentEvents = useAgentEvents();
  const agentBids = useAgentBids();
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const recentEvents = agentEvents
    .filter(e => !['done', 'no_bids', 'error', 'agent_event'].includes(e.type))
    .slice(-8).reverse();

  const toggleAgent = (id: string) => {
    setExpandedAgent(prev => (prev === id ? null : id));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between shrink-0">
        <span className="text-xs font-mono text-white/40 tracking-wider">AGENT STATES</span>
        <div className="flex items-center gap-2">
          {agentBids.length > 0 && (
            <span className="text-[10px] font-mono text-white/20">{agentBids.length} bids</span>
          )}
          {isOrchestrating && (
            <span className="flex items-center gap-1 text-[10px] font-mono text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              ACTIVE
            </span>
          )}
        </div>
      </div>

      {/* Agent state cards */}
      <div className="px-3 py-2 space-y-1.5 overflow-y-auto flex-1">
        {AGENTS.map(agent => {
          const isActive = isOrchestrating && activeAgent === agent.id;
          const lastEvent = agentEvents.filter(e => e.agent === agent.id).pop();
          const isExpanded = expandedAgent === agent.id;
          const agentHistory = agentEvents
            .filter(e => e.agent === agent.id && !['done', 'no_bids', 'error', 'agent_event'].includes(e.type))
            .slice(-5).reverse();

          let stateLabel = 'idle';
          let stateColor = 'text-white/20';
          let stateBg = 'bg-white/5 border-white/10';
          let dotColor = 'bg-white/20';

          if (isActive) {
            stateLabel = 'running';
            stateColor = 'text-green-400';
            stateBg = 'bg-green-500/10 border-green-500/25';
            dotColor = 'bg-green-400 animate-pulse';
          } else if (lastEvent) {
            stateLabel = 'done';
            stateColor = 'text-cyan-400/60';
            stateBg = 'bg-cyan-500/5 border-cyan-500/15';
            dotColor = 'bg-cyan-400/50';
          }

          return (
            <div key={agent.id}>
              <button
                onClick={() => toggleAgent(agent.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-all text-left ${
                  isActive
                    ? 'bg-opacity-10'
                    : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.03]'
                } ${isExpanded ? 'border-white/10' : ''}`}
                style={{
                  backgroundColor: isActive ? `${agent.color}08` : undefined,
                  borderColor: isActive ? `${agent.color}20` : undefined,
                  borderLeftWidth: isActive ? '2px' : '1px',
                  borderLeftColor: isActive ? agent.color : undefined,
                }}
                title="Click to view agent history"
              >
                {/* Icon */}
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-sm shrink-0"
                  style={{
                    backgroundColor: `${agent.color}12`,
                  }}
                >
                  {agent.icon}
                </div>

                {/* Name + state */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-white/60 font-medium">{agent.name}</span>
                    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${stateBg} ${stateColor}`}>
                      {stateLabel}
                    </span>
                  </div>
                  {lastEvent && (
                    <div className="text-[10px] text-white/20 truncate mt-0.5 font-mono">
                      {lastEvent.content.slice(0, 50)}{lastEvent.content.length > 50 ? '…' : ''}
                      <span className="text-white/10 ml-1">· {relativeTime(lastEvent.timestamp)}</span>
                    </div>
                  )}
                </div>

                {/* Expand chevron */}
                <span className={`text-white/15 text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                  ›
                </span>
              </button>

              {/* Expanded history */}
              {isExpanded && agentHistory.length > 0 && (
                <div className="mt-1 ml-3 pl-3 border-l border-white/[0.04] space-y-1">
                  {agentHistory.map((evt, i) => (
                    <div
                      key={`${agent.id}-evt-${i}`}
                      className="text-[9px] font-mono text-white/25 px-2 py-1 rounded bg-white/[0.01]"
                    >
                      <span className="opacity-40">[{evt.type}]</span>{' '}
                      {evt.content.slice(0, 80)}{evt.content.length > 80 ? '…' : ''}
                      <span className="text-white/10 ml-1">{relativeTime(evt.timestamp)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Recent events feed */}
      {recentEvents.length > 0 && (
        <div className="border-t border-white/5 shrink-0">
          <div className="px-4 py-1.5">
            <span className="text-[9px] font-mono text-white/20 tracking-wider">RECENT EVENTS</span>
          </div>
          <div className="px-3 pb-2 space-y-0.5 max-h-[120px] overflow-y-auto">
            {recentEvents.map((evt, i) => {
              const agent = AGENTS.find(a => a.id === evt.agent);
              const color = agent?.color || '#6366f1';
              return (
                <div
                  key={`evt-${i}`}
                  className="text-[9px] font-mono px-2 py-1 rounded truncate"
                  style={{ color: `${color}70` }}
                >
                  <span className="opacity-40">[{evt.type}]</span>{' '}
                  {agent?.name || evt.agent}: {evt.content.slice(0, 70)}
                  <span className="text-white/10 ml-1">{relativeTime(evt.timestamp)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick stats */}
      <div className="border-t border-white/5 px-4 py-2 shrink-0">
        <div className="flex items-center justify-between text-[10px] font-mono text-white/15">
          <span>{agentEvents.length} events</span>
          <span>{isOrchestrating ? `${agentBids.length} agents active` : 'standby'}</span>
        </div>
      </div>
    </div>
  );
};
