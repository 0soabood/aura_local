import React, { useState } from 'react';
import type { AgentEvent } from '../stores/auraStore';

const EVENT_ICONS: Record<string, string> = {
  react_think: '💭',
  react_verbose: '💭',
  react_act: '🛠',
  react_observe: '👀',
  code_written: '📄',
  agent_bid: '🏷',
  agent_output: '💬',
};

const EVENT_COLORS: Record<string, string> = {
  react_think: '#22d3ee',
  react_verbose: '#22d3ee',
  react_act: '#6366f1',
  react_observe: '#22c55e',
  code_written: '#f59e0b',
  agent_bid: '#14b8a6',
};

function getEventColor(type: string, agentColor?: string): string {
  return EVENT_COLORS[type] || agentColor || '#6b7280';
}

function getEventIcon(type: string): string {
  return EVENT_ICONS[type] || '◈';
}

function formatContent(evt: AgentEvent): string {
  if (evt.type === 'code_written') {
    try {
      const parsed = typeof evt.content === 'string' ? JSON.parse(evt.content) : evt.content;
      return `📄 ${parsed.filePath || parsed.path || 'unknown'} · ${parsed.lines || parsed.lineCount || '?'} lines`;
    } catch { /* fall through to raw */ }
  }
  if (evt.type === 'agent_bid') {
    try {
      const parsed = typeof evt.content === 'string' ? JSON.parse(evt.content) : evt.content;
      return `${parsed.proposedAction || evt.content} — ${((parsed.confidence || 0) * 100).toFixed(0)}% confidence`;
    } catch { /* fall through */ }
  }
  return evt.content;
}

function getDetailContent(evt: AgentEvent): string | null {
  // For events that have rich metadata, return extra detail
  if (evt.metadata) {
    try {
      return typeof evt.metadata === 'string' ? evt.metadata : JSON.stringify(evt.metadata, null, 2);
    } catch {
      return null;
    }
  }
  // For code_written, the content already has the summary
  if (evt.type === 'code_written') return null;
  // For everything else, show the full content if it was truncated
  return evt.content;
}

interface ToolCallCardProps {
  event: AgentEvent;
  agentColor?: string;
}

export const ToolCallCard: React.FC<ToolCallCardProps> = ({ event, agentColor }) => {
  const [expanded, setExpanded] = useState(false);
  const color = getEventColor(event.type, agentColor);
  const icon = getEventIcon(event.type);
  const summary = formatContent(event);
  const detail = getDetailContent(event);
  const hasDetail = detail !== null && detail.length > 0 && detail !== summary;

  return (
    <div className="flex justify-start">
      <div
        className="max-w-[85%] rounded-lg overflow-hidden cursor-pointer transition-all"
        style={{
          backgroundColor: `${color}08`,
          borderLeft: `2px solid ${color}50`,
          borderTop: `1px solid ${color}12`,
          borderRight: `1px solid ${color}12`,
          borderBottom: `1px solid ${color}12`,
        }}
        onClick={() => hasDetail && setExpanded(!expanded)}
      >
        {/* Summary line */}
        <div className="flex items-start gap-2 px-3 py-2">
          <span className="text-[10px] leading-none shrink-0 mt-0.5">{icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-mono font-medium" style={{ color: `${color}90` }}>
                [{event.type}]
              </span>
              {hasDetail && (
                <span className="text-[8px] text-white/20 ml-auto">
                  {expanded ? '▲' : '▼'}
                </span>
              )}
            </div>
            <div className="text-[10px] font-mono leading-relaxed mt-0.5" style={{ color: `${color}80` }}>
              {summary.slice(0, expanded ? undefined : 120)}{!expanded && summary.length > 120 ? '…' : ''}
            </div>
          </div>
        </div>

        {/* Expanded detail */}
        {expanded && hasDetail && (
          <div
            className="px-3 pb-2 pt-1 border-t"
            style={{ borderColor: `${color}15`, backgroundColor: `${color}04` }}
          >
            <pre className="text-[9px] font-mono leading-relaxed whitespace-pre-wrap break-all max-h-48 overflow-y-auto" style={{ color: `${color}70` }}>
              {detail}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
