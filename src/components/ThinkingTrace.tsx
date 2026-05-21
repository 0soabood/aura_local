import React, { useState } from 'react';
import { useAgentEvents, useActiveAgent, useIsOrchestrating } from '../stores/useAura';

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
  bureaucracy_agent: 'Memory',
  orchestrator: 'Orchestrator',
};

/** Icons for each event type family */
function eventIcon(type: string): string {
  if (type === 'react_think') return '🤔';
  if (type === 'react_verbose') return '💭';
  if (type === 'react_act') return '⚡';
  if (type === 'react_observe') return '👁';
  if (type === 'agent_bid') return '📊';
  if (type === 'agent_output') return '📝';
  if (type === 'code_written') return '💻';
  return '•';
}

function eventLabel(type: string): string {
  if (type === 'react_think') return 'THINK';
  if (type === 'react_verbose') return 'REASON';
  if (type === 'react_act') return 'ACT';
  if (type === 'react_observe') return 'OBSERVE';
  if (type === 'agent_bid') return 'BID';
  if (type === 'agent_output') return 'OUTPUT';
  if (type === 'code_written') return 'CODE';
  return type.toUpperCase().slice(0, 8);
}

export const ThinkingTrace: React.FC = () => {
  const agentEvents = useAgentEvents();
  const activeAgent = useActiveAgent();
  const isOrchestrating = useIsOrchestrating();
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [filterByAgent, setFilterByAgent] = useState<string | null>(null);

  // Show all diagnostic events + agent outputs, newest first
  const traceEvents = agentEvents.filter(e =>
    !['done', 'no_bids', 'error', 'agent_event'].includes(e.type)
  );

  const filtered = filterByAgent
    ? traceEvents.filter(e => e.agent === filterByAgent)
    : traceEvents;

  const shown = filtered.slice(-50).reverse();

  // Unique agents in the trace for the filter dropdown
  const agentsInTrace = [...new Set(traceEvents.map(e => e.agent).filter(Boolean))];

  return (
    <div className="flex flex-col h-full text-[10px] font-mono">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.04] shrink-0">
        <span className="text-[9px] uppercase tracking-widest text-white/30">
          {isOrchestrating ? '⚡ Thinking Trace' : '🧠 Thinking Trace'}
        </span>
        <span className="text-[8px] text-white/15">{traceEvents.length} events</span>
      </div>

      {/* Filter bar */}
      {agentsInTrace.length > 1 && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-white/[0.03] shrink-0 overflow-x-auto">
          <button
            onClick={() => setFilterByAgent(null)}
            className={`text-[8px] px-1.5 py-0.5 rounded transition-colors shrink-0 ${
              filterByAgent === null
                ? 'bg-indigo-500/20 text-indigo-300'
                : 'text-white/20 hover:text-white/40'
            }`}
          >
            all
          </button>
          {agentsInTrace.map(a => (
            <button
              key={a}
              onClick={() => setFilterByAgent(filterByAgent === a ? null : a)}
              className={`text-[8px] px-1.5 py-0.5 rounded transition-colors shrink-0`}
              style={{
                backgroundColor: filterByAgent === a ? `${AGENT_COLORS[a] || '#6366f1'}20` : 'transparent',
                color: filterByAgent === a ? (AGENT_COLORS[a] || '#6366f1') : 'rgba(255,255,255,0.2)',
              }}
            >
              {AGENT_LABELS[a] || a}
            </button>
          ))}
        </div>
      )}

      {/* Event list */}
      <div className="flex-1 overflow-y-auto">
        {shown.length === 0 && (
          <div className="px-3 py-6 text-center text-[9px] text-white/15">
            No thinking events yet
          </div>
        )}
        {shown.map((evt, i) => {
          const idx = traceEvents.indexOf(evt);
          const isExpanded = expandedIdx === idx;
          const color = AGENT_COLORS[evt.agent] || '#6366f1';
          const isVerbose = evt.type === 'react_verbose';
          const content = evt.content || '';

          return (
            <div
              key={`${evt.timestamp}-${i}`}
              className="border-b border-white/[0.015]"
            >
              <button
                onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                className={`w-full text-left px-3 py-1.5 flex items-start gap-2 hover:bg-white/[0.01] transition-colors ${
                  isExpanded ? 'bg-white/[0.02]' : ''
                }`}
              >
                {/* Type badge */}
                <span
                  className="shrink-0 mt-0.5 w-4 h-4 flex items-center justify-center rounded text-[7px] font-bold"
                  style={{ backgroundColor: `${color}20`, color }}
                  title={evt.type}
                >
                  {eventIcon(evt.type)}
                </span>

                {/* Agent + content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[8px] font-semibold" style={{ color }}>
                      {AGENT_LABELS[evt.agent] || evt.agent}
                    </span>
                    <span className="text-[7px] text-white/15 uppercase tracking-wider">
                      {eventLabel(evt.type)}
                    </span>
                    {evt.metadata?.step && (
                      <span className="text-[7px] text-white/10">
                        step {evt.metadata.step}
                        {evt.metadata.maxIterations ? `/${evt.metadata.maxIterations}` : ''}
                      </span>
                    )}
                  </div>
                  <div className={`text-[9px] leading-relaxed ${isVerbose ? 'text-white/50' : 'text-white/30'}`}>
                    {isVerbose
                      ? content.slice(0, isExpanded ? 2000 : 80) + (content.length > (isExpanded ? 2000 : 80) ? '…' : '')
                      : content.slice(0, isExpanded ? 500 : 60) + (content.length > (isExpanded ? 500 : 60) ? '…' : '')
                    }
                  </div>
                </div>

                {/* Expand indicator */}
                <span className="shrink-0 text-[8px] text-white/10 mt-0.5 transition-transform" style={{ transform: isExpanded ? 'rotate(90deg)' : '' }}>
                  ›
                </span>
              </button>

              {/* Expanded metadata */}
              {isExpanded && evt.metadata && Object.keys(evt.metadata).length > 0 && (
                <div className="px-3 pb-2 pl-9">
                  <div className="text-[7px] text-white/10 font-mono space-y-0.5">
                    {evt.metadata.model && (
                      <div>model: {evt.metadata.model}</div>
                    )}
                    {evt.metadata.tokensIn != null && (
                      <div>tokens in: {evt.metadata.tokensIn} | out: {evt.metadata.tokensOut}</div>
                    )}
                    {evt.metadata.latencyMs != null && (
                      <div>latency: {evt.metadata.latencyMs}ms</div>
                    )}
                    {evt.metadata.toolName && (
                      <div>tool: {evt.metadata.toolName}</div>
                    )}
                    {evt.metadata.toolArgs && (
                      <div className="mt-0.5">
                        <div className="text-white/15 mb-0.5">args:</div>
                        <pre className="text-[7px] text-white/20 whitespace-pre-wrap bg-white/[0.02] rounded p-1">
                          {JSON.stringify(evt.metadata.toolArgs, null, 2).slice(0, 1000)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom status */}
      <div className="px-3 py-1 border-t border-white/[0.03] text-[7px] text-white/10 shrink-0">
        {isOrchestrating && activeAgent ? (
          <span style={{ color: AGENT_COLORS[activeAgent] || '#6366f1' }}>
            ● {AGENT_LABELS[activeAgent] || activeAgent} active
          </span>
        ) : (
          <span>● idle</span>
        )}
      </div>
    </div>
  );
};
