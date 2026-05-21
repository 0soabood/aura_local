import React, { useState, useRef, useEffect } from 'react';
import { useMessages, useSendMessage, useIsOrchestrating, useActiveAgent, useAgentBids, useAgentEvents, useSelectedModel, useEnergyMode, usePendingMessages } from '../stores/useAura';

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

const TASK_CHIPS = [
  { label: 'Research', prefix: 'Research: ', icon: '🔍' },
  { label: 'Code', prefix: 'Write code to: ', icon: '⌨️' },
  { label: 'Analyze', prefix: 'Analyze and synthesize: ', icon: '📊' },
  { label: 'Plan', prefix: 'Plan and decompose: ', icon: '📋' },
  { label: 'Bureaucracy', prefix: 'Handle admin: ', icon: '📝' },
];

export const ChatPanel: React.FC = () => {
  const messages = useMessages();
  const sendMessage = useSendMessage();
  const isOrchestrating = useIsOrchestrating();
  const activeAgent = useActiveAgent();
  const agentBids = useAgentBids();
  const agentEvents = useAgentEvents();
  const selectedModel = useSelectedModel();
  const energyMode = useEnergyMode();
  const pendingMessages = usePendingMessages();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, agentEvents]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const msg = input.trim();
    setInput('');
    await sendMessage(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const insertChip = (prefix: string) => {
    setInput(prefix);
    inputRef.current?.focus();
  };

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const hasContent = messages.length > 0 || isOrchestrating || agentEvents.length > 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Composer Header ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.04] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-widest text-white/30">Orchestrate</span>
          {isOrchestrating && activeAgent && (
            <span className="flex items-center gap-1 text-[10px] font-mono" style={{ color: AGENT_COLORS[activeAgent] }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: AGENT_COLORS[activeAgent] }} />
              {AGENT_LABELS[activeAgent]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {agentBids.length > 0 && (
            <span className="text-[9px] font-mono text-white/20">{agentBids.length} agent{agentBids.length > 1 ? 's' : ''} bidding</span>
          )}
        </div>
      </div>

      {/* ── Main Scroll Area ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Empty state — hero */}
        {!hasContent && (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <svg width="48" height="48" viewBox="0 0 64 64" className="mb-4 opacity-40">
              <polygon points="32,4 56,18 56,46 32,60 8,46 8,18" fill="none" stroke="#6366f1" strokeWidth="1.5" />
              <text x="32" y="38" textAnchor="middle" fill="#6366f1" fontSize="18" fontFamily="monospace" fontWeight="bold">A</text>
            </svg>
            <h2 className="text-lg font-semibold text-white/50 mb-1">AURA is ready</h2>
            <p className="text-xs text-white/25 max-w-[280px] leading-relaxed mb-6">
              Describe a task — agents will bid, plan, and execute autonomously.
            </p>

            {/* Task chips */}
            <div className="flex flex-wrap gap-1.5 justify-center max-w-[400px]">
              {TASK_CHIPS.map(chip => (
                <button
                  key={chip.label}
                  onClick={() => insertChip(chip.prefix)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.03] border border-white/[0.06] text-white/40 hover:text-white/60 hover:border-indigo-500/20 hover:bg-indigo-500/5 transition-all"
                >
                  <span>{chip.icon}</span>
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Agent Bids Bar */}
        {agentBids.length > 0 && (
          <div className="px-4 py-2 border-b border-white/[0.03]">
            <div className="flex gap-1.5 overflow-x-auto">
              {agentBids.map((bid, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono whitespace-nowrap"
                  style={{
                    backgroundColor: `${AGENT_COLORS[bid.agentName] || '#6366f1'}10`,
                    border: `1px solid ${AGENT_COLORS[bid.agentName] || '#6366f1'}25`,
                    color: AGENT_COLORS[bid.agentName] || '#6366f1',
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: AGENT_COLORS[bid.agentName] }} />
                  {AGENT_LABELS[bid.agentName] || bid.agentName}
                  <span className="opacity-50">{(bid.confidence * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {hasContent && (
          <div className="px-4 py-3 space-y-3">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              const isError = msg.role === 'error';
              const agentColor = msg.agent ? AGENT_COLORS[msg.agent] : undefined;

              return (
                <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[90%] rounded-lg px-3.5 py-2.5 text-sm ${
                      isUser
                        ? 'bg-indigo-500/15 border border-indigo-500/25 text-white'
                        : isError
                        ? 'bg-rose-500/[0.08] border border-rose-500/20 text-rose-300'
                        : 'bg-white/[0.02] border border-white/[0.04] text-white/80'
                    }`}
                  >
                    {!isUser && msg.agent && (
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: agentColor }} />
                        <span className="text-[10px] font-mono font-medium" style={{ color: agentColor }}>
                          {AGENT_LABELS[msg.agent] || msg.agent}
                        </span>
                      </div>
                    )}
                    <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                    <div className="text-[9px] text-white/15 mt-1.5 font-mono">{formatTime(msg.timestamp)}</div>
                  </div>
                </div>
              );
            })}

            {/* Live agent events — filter out meta/system events */}
            {agentEvents.filter(e => !['done', 'no_bids', 'error', 'agent_event'].includes(e.type)).slice(-4).map((evt, i) => (
              <div key={`${i}-${evt.timestamp}`} className="flex justify-start">
                <div className="max-w-[85%] rounded px-2.5 py-1.5 text-[10px] font-mono"
                  style={{
                    backgroundColor: `${AGENT_COLORS[evt.agent] || '#6366f1'}06`,
                    border: `1px solid ${AGENT_COLORS[evt.agent] || '#6366f1'}12`,
                    color: `${AGENT_COLORS[evt.agent] || '#6366f1'}80`,
                  }}
                >
                  <span className="opacity-40">[{evt.type}]</span>{' '}
                  {AGENT_LABELS[evt.agent] || evt.agent}: {evt.content.slice(0, 100)}{evt.content.length > 100 ? '…' : ''}
                </div>
              </div>
            ))}

            {/* Orchestrating indicator */}
            {isOrchestrating && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-xs text-white/30 font-mono">Processing...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── Input Area ── */}
      <div className="shrink-0 border-t border-white/[0.04] bg-[#0a0a14]">
        {/* Context bar */}
        <div className="flex items-center gap-2 px-4 py-1.5">
          {selectedModel !== 'auto' && (
            <span className="text-[9px] font-mono text-indigo-400/40">
              {selectedModel.split('/').pop()?.slice(0, 16)}
            </span>
          )}
          {selectedModel === 'auto' && (
            <span className="text-[9px] font-mono text-white/15">auto-routing</span>
          )}
          <span className="text-[9px] text-white/10">·</span>
          <span className="text-[9px] font-mono text-white/15">
            {energyMode === 'low' ? '⚡ low energy' : '🔥 high energy'}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="px-3 py-2">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                pendingMessages.length > 0
                  ? `${pendingMessages.length} message${pendingMessages.length > 1 ? 's' : ''} queued...`
                  : isOrchestrating
                    ? 'Agent running...'
                    : 'Describe a task...'
              }
              disabled={false}
              rows={1}
              className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/20 resize-none focus:outline-none focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/15 font-sans disabled:opacity-40 transition-all"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-4 py-2.5 rounded-lg bg-gradient-to-b from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 disabled:opacity-20 disabled:cursor-not-allowed text-white text-sm font-medium transition-all shadow-lg shadow-indigo-500/10"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
