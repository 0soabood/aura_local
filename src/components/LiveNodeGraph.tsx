import React, { useState } from 'react';
import { useActiveAgent, useIsOrchestrating, useAgentEvents } from '../stores/useAura';

interface NodePosition {
  x: number;
  y: number;
  label: string;
  icon: string;
  color: string;
  glowColor: string;
}

const nodes: NodePosition[] = [
  { x: 50, y: 15, label: 'Research', icon: '🔍', color: '#22d3ee', glowColor: 'rgba(34,211,238,0.3)' },
  { x: 85, y: 50, label: 'Code', icon: '⌨️', color: '#a855f7', glowColor: 'rgba(168,85,247,0.3)' },
  { x: 50, y: 85, label: 'Synthesis', icon: '🧠', color: '#22c55e', glowColor: 'rgba(34,197,94,0.3)' },
  { x: 15, y: 50, label: 'Memory', icon: '💾', color: '#f59e0b', glowColor: 'rgba(245,158,11,0.3)' },
];

const agentNodeMap: Record<string, number> = {
  research_agent: 0,
  code_agent: 1,
  synthesis_agent: 2,
  memory: 3,
};

export const LiveNodeGraph: React.FC = () => {
  const activeAgent = useActiveAgent();
  const isOrchestrating = useIsOrchestrating();
  const agentEvents = useAgentEvents();
  const [selectedNode, setSelectedNode] = useState<number | null>(null);
  const activeNodeIdx = activeAgent ? agentNodeMap[activeAgent] ?? -1 : -1;
  const recentEvents = agentEvents.slice(-4);

  const agentLabels: Record<string, string> = {
    research_agent: 'Research Agent',
    code_agent: 'Code Agent',
    synthesis_agent: 'Synthesis Agent',
    memory: 'Memory Agent',
  };

  const agentDescs: Record<string, string> = {
    research_agent: 'Web search, analysis, and knowledge retrieval',
    code_agent: 'Implementation, testing, and debugging',
    synthesis_agent: 'Summarization, writing, and output generation',
    memory: 'Context management and long-term recall',
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-1.5 border-b border-white/[0.03] flex items-center justify-between shrink-0">
        <span className="text-[9px] font-mono uppercase tracking-widest text-white/20">Agent Graph</span>
        {isOrchestrating && (
          <span className="flex items-center gap-1 text-[9px] font-mono text-cyan-400/50">
            <span className="w-1 h-1 rounded-full bg-cyan-400 animate-pulse" />
            LIVE
          </span>
        )}
      </div>

      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
          <defs>
            <filter id="supervisorGlow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {nodes.map((n, i) => (
              <filter key={i} id={`glow-${i}`}>
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            ))}
            {nodes.map((n, i) => (
              <linearGradient key={`grad-${i}`} id={`conn-${i}`} x1="50%" y1="50%" x2={`${n.x}%`} y2={`${n.y}%`}>
                <stop offset="0%" stopColor={isOrchestrating && activeNodeIdx === i ? n.color : '#6366f1'} stopOpacity="0.8" />
                <stop offset="100%" stopColor={isOrchestrating && activeNodeIdx === i ? n.color : '#6366f1'} stopOpacity="0.2" />
              </linearGradient>
            ))}
          </defs>

          {/* Background grid */}
          <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="white" strokeOpacity="0.015" strokeWidth="0.2" />
          </pattern>
          <rect width="100" height="100" fill="url(#grid)" />

          {/* Connection lines */}
          {nodes.map((n, i) => (
            <g key={`conn-${i}`}>
              <line
                x1="50" y1="50"
                x2={n.x} y2={n.y}
                stroke={`url(#conn-${i})`}
                strokeWidth={isOrchestrating && activeNodeIdx === i ? "1.2" : "0.4"}
                strokeDasharray={isOrchestrating && activeNodeIdx === i ? "none" : "2 1.5"}
                className={isOrchestrating && activeNodeIdx === i ? 'animate-pulse' : ''}
              />
              {isOrchestrating && activeNodeIdx === i && (
                <>
                  <circle r="1" fill={n.color} opacity="0.8">
                    <animateMotion dur="1.5s" repeatCount="indefinite" path={`M50,50 L${n.x},${n.y}`} />
                  </circle>
                  <circle r="0.7" fill={n.color} opacity="0.5">
                    <animateMotion dur="1.5s" begin="0.75s" repeatCount="indefinite" path={`M50,50 L${n.x},${n.y}`} />
                  </circle>
                </>
              )}
            </g>
          ))}

          {/* Supervisor node (center hexagon) — clickable */}
          <g filter="url(#supervisorGlow)" className="cursor-pointer" onClick={() => setSelectedNode(-1)} style={{ cursor: 'pointer' }}>
            <polygon
              points="50,38 60,44 60,56 50,62 40,56 40,44"
              fill="#6366f115"
              stroke={isOrchestrating ? '#6366f1' : '#6366f160'}
              strokeWidth={isOrchestrating ? "1.2" : "0.6"}
              className={isOrchestrating ? 'animate-pulse' : ''}
            />
            <text x="50" y="52" textAnchor="middle" fill="#6366f1" fontSize="5" fontFamily="monospace">
              ⬡
            </text>
          </g>

          {/* Worker nodes — clickable */}
          {nodes.map((n, i) => {
            const isActive = isOrchestrating && activeNodeIdx === i;
            const isSelected = selectedNode === i;
            return (
              <g
                key={`node-${i}`}
                className="cursor-pointer"
                onClick={() => setSelectedNode(isSelected ? null : i)}
                style={{ cursor: 'pointer' }}
              >
                {isActive && (
                  <circle cx={n.x} cy={n.y} r="10" fill={n.glowColor}>
                    <animate attributeName="r" values="8;12;8" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.3;0.6;0.3" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
                <polygon
                  points={`${n.x},${n.y - 5} ${n.x + 4.3},${n.y - 2.5} ${n.x + 4.3},${n.y + 2.5} ${n.x},${n.y + 5} ${n.x - 4.3},${n.y + 2.5} ${n.x - 4.3},${n.y - 2.5}`}
                  fill={isActive ? `${n.color}20` : isSelected ? `${n.color}15` : 'rgba(255,255,255,0.02)'}
                  stroke={isActive ? n.color : isSelected ? `${n.color}80` : `${n.color}40`}
                  strokeWidth={isActive ? "0.8" : isSelected ? "0.7" : "0.4"}
                />
                <text x={n.x} y={n.y + 1.5} textAnchor="middle" fontSize="2.5">
                  {n.icon}
                </text>
                <text x={n.x} y={n.y + 7} textAnchor="middle" fill={isActive ? n.color : `${n.color}50`} fontSize="2" fontFamily="monospace">
                  {n.label.toUpperCase()}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Node detail tooltip */}
        {selectedNode !== null && (
          <div className="absolute top-2 left-2 right-2 bg-[#0d0d1a]/95 backdrop-blur border border-white/10 rounded-lg p-2.5 shadow-xl">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-xs">{selectedNode === -1 ? '⬡' : nodes[selectedNode].icon}</span>
                <span className="text-xs font-medium text-white/70">{selectedNode === -1 ? 'Orchestrator' : nodes[selectedNode].label}</span>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-[10px] text-white/20 hover:text-white/50 px-1"
              >
                ✕
              </button>
            </div>
            <div className="text-[9px] text-white/30 mb-1.5">
              {selectedNode === -1
                ? 'Central coordination hub — routes tasks to agents'
                : agentDescs[Object.keys(agentNodeMap).find(k => agentNodeMap[k] === selectedNode) || ''] || 'Agent node'}
            </div>
            {(() => {
              if (selectedNode === -1) {
                const orchEvents = agentEvents.filter(e => e.agent?.includes('orchestrator')).slice(-3);
                if (orchEvents.length === 0) return <div className="text-[9px] text-white/15">No recent orchestrator activity</div>;
                return (
                  <div className="space-y-0.5">
                    {orchEvents.map((evt, i) => (
                      <div key={i} className="text-[8px] font-mono text-white/25 truncate">
                        <span className="opacity-40">[{evt.type}]</span> {evt.content.slice(0, 60)}
                      </div>
                    ))}
                  </div>
                );
              }
              const agentKey = Object.keys(agentNodeMap).find(k => agentNodeMap[k] === selectedNode);
              const nodeEvents = agentEvents.filter(e => e.agent === agentKey).slice(-3);
              if (nodeEvents.length === 0) return <div className="text-[9px] text-white/15">No recent activity</div>;
              return (
                <div className="space-y-0.5">
                  {nodeEvents.map((evt, i) => (
                    <div key={i} className="text-[8px] font-mono text-white/25 truncate">
                      <span className="opacity-40">[{evt.type}]</span> {evt.content.slice(0, 60)}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* Event feed overlay */}
        {recentEvents.length > 0 && (
          <div className="absolute bottom-1.5 left-1.5 right-1.5 space-y-0.5 pointer-events-none">
            {recentEvents.map((evt, i) => (
              <div
                key={`${i}-${evt.timestamp}`}
                className="text-[8px] font-mono px-1.5 py-0.5 rounded truncate"
                style={{
                  backgroundColor: 'rgba(10,10,20,0.7)',
                  color: `${nodes[agentNodeMap[evt.agent] ?? 0]?.color || '#6366f1'}70`,
                  opacity: 1 - (recentEvents.length - 1 - i) * 0.2,
                }}
              >
                {evt.type}: {evt.content.slice(0, 50)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
