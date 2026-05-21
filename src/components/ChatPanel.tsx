import React, { useState, useRef, useEffect } from 'react';
import { useMessages, useSendMessage, useIsOrchestrating, useActiveAgent, useAgentBids, useAgentEvents, useEnergyMode, usePendingMessages, useActiveSession } from '../stores/useAura';
import { useAuraStore, ChatMessage } from '../stores/auraStore';
import { useClearChat } from '../stores/useAura';
import { FileLink } from './FileLink';
import { ToolCallCard } from './ToolCallCard';
import { MarkdownRenderer } from './MarkdownRenderer';
import { showToast } from './ToastContainer';
import { CommandPalette } from './CommandPalette';
import type { Command } from './CommandPalette';
import { ModelSelector } from './ModelSelector';

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
  const activeSession = useActiveSession();
  const sendMessage = useSendMessage();
  const isOrchestrating = useIsOrchestrating();
  const activeAgent = useActiveAgent();
  const agentBids = useAgentBids();
  const agentEvents = useAgentEvents();
  const energyMode = useEnergyMode();
  const pendingMessages = usePendingMessages();
  const clearChat = useClearChat();
  const [input, setInput] = useState('');
  const [showCommands, setShowCommands] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, agentEvents]);

  // ── Load session messages when switching sessions ──
  useEffect(() => {
    if (!activeSession) return;

    const loadSessionMessages = async () => {
      try {
        const data = (window as any).aura?.getSessionEvents
          ? await (window as any).aura.getSessionEvents(activeSession)
          : await fetch(`/api/sessions/${activeSession}/events`).then(res => res.ok ? res.json() : []).catch(() => []);

        if (!Array.isArray(data)) return;

        const loaded: ChatMessage[] = data
          .filter((e: any) =>
            e.event_type === 'user_message' ||
            e.event_type === 'synthesis_complete' ||
            e.event_type === 'agent_output' ||
            e.event_type === 'execution_error' ||
            e.event_type === 'escalation_required'
          )
          .map((e: any): ChatMessage => {
            let role: ChatMessage['role'] = 'agent';
            let content = e.content || '';

            if (e.event_type === 'user_message') {
              role = 'user';
            } else if (e.event_type === 'synthesis_complete') {
              role = 'synthesis';
            } else if (e.event_type === 'execution_error' || e.event_type === 'escalation_required') {
              role = 'error';
              try { content = JSON.parse(content).reason || content; } catch { /* keep raw */ }
            }

            return {
              id: typeof e.id === 'string' ? e.id : String(e.id),
              role,
              content,
              agent: e.author,
              timestamp: e.created_at ? new Date(e.created_at).getTime() : Date.now(),
            };
          });

        useAuraStore.setState({ messages: loaded });

        // Also load diagnostic events (thinking trace, tool calls, bids) so the
        // ThinkingTrace panel shows historical data for previously persisted events.
        const traceEvents = data
          .filter((e: any) =>
            e.event_type === 'react_think' ||
            e.event_type === 'react_verbose' ||
            e.event_type === 'react_act' ||
            e.event_type === 'react_observe' ||
            e.event_type === 'agent_bid' ||
            e.event_type === 'agent_output' ||
            e.event_type === 'code_written'
          )
          .map((e: any) => ({
            type: e.event_type,
            agent: e.author || e.agentName || 'system',
            content: e.content || '',
            timestamp: e.created_at ? new Date(e.created_at).getTime() : Date.now(),
            metadata: typeof e.metadata === 'string' ? JSON.parse(e.metadata) : e.metadata || undefined,
          }));

        if (traceEvents.length > 0) {
          useAuraStore.setState({ agentEvents: traceEvents });
        }
      } catch (err) {
        console.error('Failed to load session events:', err);
      }
    };

    loadSessionMessages();
  }, [activeSession]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const msg = input.trim();
    setInput('');
    await sendMessage(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Let the command palette handle navigation keys when it's open
    if (showCommands && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Escape')) {
      // The CommandPalette's document-level listener handles these
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleCommandSelect = (cmd: Command) => {
    setShowCommands(false);
    if (cmd.action === 'clear') {
      clearChat();
      showToast('Conversation cleared', 'success', 2000);
      return;
    }
    // For all other commands, auto-fill the input with the prefix
    setInput(cmd.prefix);
    inputRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);

    // Show command palette when input starts with /
    if (val.startsWith('/')) {
      const query = val.slice(1); // everything after /
      setCommandQuery(query);
      setShowCommands(true);
    } else {
      setShowCommands(false);
      setCommandQuery('');
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
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.04] shrink-0 select-none">
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

              // Try to parse escalation JSON for reason + actionable fields
              let escalationReason = '';
              let escalationActionable = '';
              if (isError) {
                try {
                  const parsed = JSON.parse(msg.content);
                  escalationReason = parsed.reason || msg.content;
                  escalationActionable = parsed.actionable || '';
                } catch {
                  escalationReason = msg.content;
                }
              }

              return (
                <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'} group`}>
                  <div
                    className={`${isUser ? 'max-w-[85%]' : isError ? 'max-w-[95%]' : 'max-w-[90%]'} rounded-lg px-3.5 py-2.5 text-sm ${
                      isUser
                        ? 'bg-indigo-500/15 border border-indigo-500/25 text-white'
                        : isError
                        ? 'bg-transparent border-0 text-white/80'
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
                    {/* Render error/escalation as a prominent banner, not a tiny bubble */}
                    {isError ? (
                      <div className="w-full max-w-[95%]">
                        {/* Escalation banner */}
                        <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-sm">
                          <div className="flex items-start gap-2.5">
                            <span className="text-lg mt-0.5 shrink-0">⚠️</span>
                            <div className="min-w-0 space-y-1.5">
                              <p className="text-amber-200 font-medium text-xs uppercase tracking-wider">
                                {escalationReason.toLowerCase().includes('timeout')
                                  ? '⏱ Model Timeout — Fallback Attempted'
                                  : escalationReason.toLowerCase().includes('quota') || escalationReason.toLowerCase().includes('rate limit')
                                    ? '📊 API Quota Exhausted'
                                    : '⚠️ Processing Error'}
                              </p>
                              <p className="text-amber-100/80 leading-relaxed whitespace-pre-wrap">
                                {escalationReason}
                              </p>
                              {escalationActionable && (
                                <div className="mt-2 flex items-start gap-2 rounded bg-white/[0.03] border border-white/[0.06] px-3 py-2">
                                  <span className="text-amber-300 text-xs mt-0.5 shrink-0">💡</span>
                                  <p className="text-amber-100/60 text-xs leading-relaxed">
                                    {escalationActionable}
                                  </p>
                                </div>
                              )}
                              <div className="flex items-center gap-2 mt-2">
                                <button
                                  onClick={() => {
                                    // Auto-send a concise retry prompt using gathered data
                                    const retryMsg = 'Write a concise response using only the information gathered so far. Summarize what was found.';
                                    setInput(retryMsg);
                                    setTimeout(() => sendMessage(retryMsg), 50);
                                  }}
                                  className="px-2.5 py-1 rounded-md text-[10px] font-mono font-medium bg-white/[0.04] border border-white/[0.08] text-white/50 hover:text-white/80 hover:border-indigo-500/30 hover:bg-indigo-500/10 transition-all"
                                >
                                  🔄 Retry with gathered data
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : isUser ? (
                      <div className="whitespace-pre-wrap leading-relaxed"><FileLink content={msg.content} /></div>
                    ) : (
                      <MarkdownRenderer content={msg.content} />
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[9px] text-white/15 font-mono">{formatTime(msg.timestamp)}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(msg.content);
                          showToast('Copied to clipboard', 'success', 2000);
                        }}
                        className="text-[9px] font-mono text-white/15 hover:text-white/40 transition-colors opacity-0 group-hover:opacity-100"
                        title="Copy message"
                      >
                        📋 copy
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Live agent events — ToolCallCard for rich display */}
            {agentEvents.filter(e => !['done', 'no_bids', 'error', 'agent_event'].includes(e.type)).slice(-4).map((evt, i) => (
              <ToolCallCard
                key={`${i}-${evt.timestamp}`}
                event={evt}
                agentColor={AGENT_COLORS[evt.agent]}
              />
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
      <div className="shrink-0 border-t border-white/[0.04] bg-[#0a0a14] relative">
        {/* Command Palette — positioned above the input */}
        <CommandPalette
          query={commandQuery}
          visible={showCommands}
          onSelect={handleCommandSelect}
          onClose={() => setShowCommands(false)}
        />
        {/* Context bar — select-none to keep it chrome-like */}
        <div className="flex items-center gap-2 px-4 py-1.5 select-none">
          <ModelSelector />
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
              onChange={handleInputChange}
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
