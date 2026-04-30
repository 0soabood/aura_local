import { useState, useEffect, useRef } from 'react';
import { Terminal, Send, ChevronsRight, ChevronsLeft, AlertTriangle, History, Plus } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { BlackboardEvent } from '../shared/types';
import { DebugPanel } from './DebugPanel';

const getAura = () => (window as any).aura;

/**
 * Dedicated client helper to consume the SSE streaming orchestrator endpoint.
 * Uses the preload bridge (window.aura.streamOrchestrate) as required by architecture rules.
 * Falls back to direct fetch only if the bridge is unavailable (e.g., Vite browser testing).
 */
interface StreamPayload {
  message: string;
  sessionId: string | null;
  debug?: boolean;
  preferredModel?: string;
  energyMode?: 'low' | 'high';
}

async function streamOrchestrate(
  payload: StreamPayload,
  onEvent: (event: string, data: any) => void
) {
  const aura = getAura();
  
  // Use preload bridge if available
  if (aura?.streamOrchestrate) {
    return aura.streamOrchestrate(payload, onEvent);
  }
  
  // Fallback for non-Electron environments (Vite dev server)
  const response = await fetch('/api/orchestrate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, stream: true })
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder("utf-8");
  let doneReading = false;

  while (!doneReading && reader) {
    const { value, done } = await reader.read();
    doneReading = done;
    if (value) {
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n\n");

      for (const line of lines) {
        if (!line.startsWith("event: ")) continue;
        
        const eventType = line.split("\n")[0].replace("event: ", "");
        const dataLine = line.split("\n")[1]?.replace("data: ", "") || "{}";
        try {
          onEvent(eventType, JSON.parse(dataLine));
        } catch (e) {
          console.error("SSE Parse Error:", e);
        }
      }
    }
  }
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
}

interface DebugData {
  events: BlackboardEvent[];
  latency: number;
  loops: number;
  termination: string;
}

interface Session {
  id: string;
  name?: string;
  title?: string;
  updated_at: string;
  state?: 'running' | 'done' | 'error' | 'idle';
}

export default function CoreTerminal() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'running' | 'complete' | 'error'>('idle');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState('auto');
  
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugData, setDebugData] = useState<DebugData>({ events: [], latency: 0, loops: 0, termination: 'none' });

  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<string>('checking...');
  const [selectedModel, setSelectedModel] = useState<string>('auto');
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const [energyMode, setEnergyMode] = useState<'low' | 'high'>('high');
  const [brainDumpMode, setBrainDumpMode] = useState(false);

  // Available models for selection
  const availableModels = [
    { id: 'auto', label: 'Auto (Default)' },
    { id: 'google:gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'vertex:gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'cohere:command-r-plus-08-2024', label: 'Command R+' },
    { id: 'openrouter:meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B' },
    { id: 'mistral:mistral-small-latest', label: 'Mistral Small' },
    { id: 'deepseek:deepseek-v3', label: 'DeepSeek V3' },
    { id: 'groq:llama-3.1-8b-instant', label: 'Llama 3.1 8B (Groq)' },
  ];

  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [messages, status]);

  useEffect(() => {
    // Fetch active provider on mount
    getAura()?.getActiveProvider?.().then(setActiveProvider).catch(() => setActiveProvider('offline'));
  }, []);

  // WebSocket debug connection for live ReAct trace
  useEffect(() => {
    if (!activeId || status !== 'running') return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/debug/${activeId}`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log(`[WebSocket] Connected to debug stream for session ${activeId}`);
      setWsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[WebSocket] Debug event:', data);
        
        // Handle different event types from the orchestrator
        if (data.event_type || data.author) {
          setDebugData(prev => {
            const newEvent = {
              id: data.id || crypto.randomUUID(),
              event_type: data.event_type || 'agent_event',
              author: data.author || 'unknown',
              content: data.content || JSON.stringify(data),
              created_at: data.created_at || new Date().toISOString(),
              metadata: data.metadata || null,
              session_id: data.session_id || '',
              seq: data.seq || 0
            } as BlackboardEvent;
            // Deduplicate by ID and content
            if (prev.events.some(e => e.id === newEvent.id && e.event_type === newEvent.event_type)) return prev;
            return { ...prev, events: [...prev.events, newEvent] };
          });
        }
      } catch (e) {
        console.error('[WebSocket] Parse error:', e);
      }
    };

    ws.onclose = () => {
      console.log(`[WebSocket] Disconnected from debug stream`);
      setWsConnected(false);
    };

    ws.onerror = (error) => {
      console.error('[WebSocket] Error:', error);
      setWsConnected(false);
    };

    return () => {
      ws.close();
      wsRef.current = null;
      setWsConnected(false);
    };
  }, [activeId, status]);

  const loadSessions = async () => {
    try {
      const data = getAura()?.listSessions 
        ? await getAura()?.listSessions() 
        : await fetch('/api/sessions').then(res => res.ok ? res.json() : []).catch(() => []);
      setSessions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const selectSession = async (id: string) => {
    setActiveId(id);
    setStatus('idle');
    setMessages([]);
    try {
      const events: BlackboardEvent[] = getAura()?.getSessionEvents 
        ? await getAura().getSessionEvents(id) 
        : await fetch(`/api/sessions/${id}/events`).then(res => res.ok ? res.json() : []).catch(() => []);
      const loadedMessages = events
        .filter(e => e.event_type === 'user_message' || e.event_type === 'synthesis_complete' || e.event_type === 'escalation_required')
        .map((e): Message => {
          let content = e.content;
          if (e.event_type === 'escalation_required') {
            try { content = JSON.parse(e.content).reason || e.content; } catch { /* keep raw string */ }
          }
          return {
            id: e.id.toString(),
            role: (e.event_type === 'user_message' ? 'user' : (e.event_type === 'escalation_required' ? 'error' : 'assistant')) as 'user' | 'assistant' | 'error',
            content
          };
        });
      setMessages(loadedMessages);
    } catch (err) {
      console.error('Failed to load session events:', err);
    }
  };

  const newSession = async () => {
    try {
      const res = getAura()?.createSession 
        ? await getAura().createSession() 
        : await fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'New Session' })
          }).then(r => r.ok ? r.json() : null);

      if (res && res.id) {
        setActiveId(res.id);
        setStatus('idle');
        setMessages([]);
        setDebugData({ events: [], latency: 0, loops: 0, termination: 'none' });
        await loadSessions();
      } else {
        setActiveId(null);
      }
    } catch (err) {
      console.error('Failed to create new session:', err);
      setActiveId(null);
    } finally {
      setMessages([]);
      setStatus('idle');
      setDebugData({ events: [], latency: 0, loops: 0, termination: 'none' });
    }
  };

  const route = async () => {
    const text = input.trim();
    if (!text || status === 'running') return;

    setInput('');
    setStatus('running');
    
    const userMsgId = crypto.randomUUID();
    setMessages(prev => [...prev, { id: userMsgId, role: 'user', content: text }]);
    setActiveAgent(null);

    try {
      // Prefix mode directive if explicit routing is requested
      let routedMessage = mode === 'auto' ? text : `[Focus: ${mode}] ${text}`;
      
      // Add Brain Dump Mode prompt if enabled
      if (brainDumpMode) {
        routedMessage = `[BRAIN DUMP MODE] The user has provided a vague goal or idea. ` +
          `Break it down into a structured, actionable checklist with clear steps. ` +
          `Format as a markdown checklist with - [ ] for incomplete items.\n\nUser goal: ${text}`;
        console.log('[Brain Dump Mode] Decomposing vague goal into checklist...');
      }
      
      // Add selected model if not 'auto'
      const preferredModel = selectedModel === 'auto' ? undefined : selectedModel;
      
      await streamOrchestrate(
        { message: routedMessage, sessionId: activeId, debug: true, preferredModel, energyMode },


        (eventType, data) => {
          if (eventType === 'progress') {
            setActiveAgent(data.agent);
          } else if (eventType === 'agent_event') {
            setDebugData(prev => {
              // Deduplicate if the same ID somehow arrives
              if (prev.events.some(e => e.id === data.id && e.event_type === data.event_type && e.content === data.content)) return prev;
              return { ...prev, events: [...prev.events, data] };
            });
          } else if (eventType === 'done') {
            setActiveId(data.sessionId);
            setMessages(prev => [...prev, { 
              id: crypto.randomUUID(), role: 'assistant', content: data.finalResponse 
            }]);
            setDebugData(prev => {
              // Merge final persisted events with our ephemeral lived stream, de-duping by ID or content matching
              // Since DB events have ID > 0 and trace events might have dummy IDs, we just append non-duplicates
              const newDbEvents = (data.events || []).filter((e: any) => 
                !prev.events.some(pe => pe.event_type === e.event_type && pe.content === e.content)
              );
              return {
                events: [...prev.events, ...newDbEvents],
                latency: data.totalLatencyMs,
                loops: data.totalLoops,
                termination: data.terminationReason
              };
            });
            setStatus('complete');
            setActiveAgent(null);
            loadSessions();
          } else if (eventType === 'error') {
            setMessages(prev => [...prev, { 
              id: crypto.randomUUID(), role: 'error', content: data.message || 'Orchestration error' 
            }]);
            setStatus('error');
            setActiveAgent(null);
          }
        }
      );
    } catch (err: any) {
      setMessages(prev => [...prev, { 
        id: crypto.randomUUID(), 
        role: 'error', 
        content: err.message || 'Orchestration failed' 
      }]);
      setStatus('error');
      setActiveAgent(null);
    }
  };

  const renderDebugEvent = (ev: BlackboardEvent, i: number) => (
    <div key={i} className="activity p-3 border border-[#222] bg-[#111] rounded-xl shadow-sm text-[11px] font-mono hover:border-[#333] transition-colors break-words">
      <div className="flex justify-between items-start mb-2 opacity-70 border-b border-[#222] pb-1.5 align-middle">
        <span className="text-[9px] uppercase tracking-widest text-[#9ca3af] font-bold">
          {ev.author}
        </span>
        <span className="text-[9px] text-[#6b7280]">{ev.event_type}</span>
      </div>
      <div className="text-gray-300 leading-relaxed whitespace-pre-wrap">
        {ev.content.length > 200 ? ev.content.slice(0, 200) + '...' : ev.content}
      </div>
    </div>
  );

  return (
    <div className={`terminal ${!debugOpen ? 'right-collapsed' : ''} ${!historyOpen ? 'left-collapsed' : ''} flex h-full w-full bg-[#050505] overflow-hidden`}>
      
      {/* HISTORY DRAWER */}
      {!historyOpen ? (
        <div 
          onClick={() => { setHistoryOpen(true); loadSessions(); }} 
          className="w-12 border-r border-[#222] bg-[#0a0a0a] flex flex-col items-center py-6 cursor-pointer hover:bg-[#111] transition-colors"
          title="Expand History"
        >
          <History size={18} className="text-gray-500 hover:text-gray-300 transition-colors" />
          <div className="mt-8 text-[11px] text-gray-600 tracking-widest font-mono" style={{ writingMode: 'vertical-rl' }}>
            HISTORY
          </div>
        </div>
      ) : (
        <aside className="w-64 border-r border-[#222] bg-[#0a0a0a] flex flex-col transition-all">
          <div className="p-4 border-b border-[#222] flex justify-between items-center bg-[#111]">
            <span className="text-sm font-semibold text-gray-200 tracking-wide">Sessions</span>
            <div className="flex gap-2">
              <button onClick={newSession} className="text-gray-400 hover:text-white p-1 rounded hover:bg-white/5 transition-all" title="New Session">
                <Plus size={18} />
              </button>
              <button onClick={() => setHistoryOpen(false)} className="text-gray-400 hover:text-white p-1 rounded hover:bg-white/5 transition-all">
                <ChevronsLeft size={18} />
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {sessions.length === 0 ? (
              <div className="text-gray-600 text-xs text-center p-4">No history.</div>
            ) : (
              sessions.map(s => {
                const isResumed = s.state === 'done' || s.state === 'error';
                return (
                <div 
                  key={s.id} 
                  onClick={() => selectSession(s.id)}
                  className={`p-3 rounded-lg cursor-pointer text-sm transition-all border ${
                    activeId === s.id 
                      ? 'bg-blue-600/10 border-blue-500/20 text-blue-100 shadow-sm' 
                      : 'bg-transparent border-transparent hover:bg-white/5 text-gray-400 hover:text-gray-200'
                  }`}
                >
                  <div className="truncate font-medium" title={s.title || s.name || `Session ${s.id.slice(0, 8)}`}>
                    {s.title || s.name || `Session ${s.id.slice(0, 8)}`}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-1.5 flex justify-between items-center font-mono">
                    <span className="opacity-75">{new Date(s.updated_at).toLocaleDateString()}</span>
                    <div className="flex gap-1 items-center">
                      {isResumed && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider bg-amber-500/20 text-amber-400 font-bold" title="Resumable session">
                          ↻
                        </span>
                      )}
                      {s.state && (
                        <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider ${
                          s.state === 'running' 
                            ? 'bg-blue-500/20 text-blue-400 font-bold animate-pulse' 
                            : s.state === 'error'
                            ? 'bg-red-500/20 text-red-400 font-bold'
                            : 'bg-white/5 text-gray-500'
                        }`}>
                          {s.state}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                );
              })
            )}
          </div>
        </aside>
      )}

      {/* MAIN FEED */}
      <section className="feed flex-1 flex flex-col relative bg-[#0a0a0a]">
        <div className="feed-stream flex-1 overflow-y-auto px-6 py-6" ref={feedRef} style={{ scrollBehavior: 'smooth' }}>
          {messages.length === 0 && status !== 'running' ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center text-gray-500/60">
                <Terminal size={48} className="mx-auto mb-4 opacity-50" />
                <h2 className="text-lg font-medium tracking-wide">AURA Shell Ready</h2>
                <p className="text-sm mt-2 opacity-70">Select a session or enter an objective to begin.</p>
              </div>
            </div>
          ) : (
            messages.map(msg => (
              <div key={msg.id} className={`mb-6 flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[85%] px-5 py-4 rounded-2xl ${
                  msg.role === 'user' 
                    ? 'bg-blue-600 text-white shadow-md' 
                    : msg.role === 'error' 
                      ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                      : 'bg-[#18181b] text-gray-200 border border-[#27272a] shadow-sm'
                }`}>
                  {msg.role === 'assistant' ? (
                    <div className="markdown-body prose prose-invert prose-sm max-w-none prose-pre:bg-[#000] prose-pre:border prose-pre:border-[#333]">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : msg.role === 'error' ? (
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <AlertTriangle size={16} /> {msg.content}
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap text-[15px] leading-relaxed">{msg.content}</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* INPUT COMPOSER */}
        <div className="composer p-4 bg-[#111] border-t border-[#222]">
          <div className="flex gap-3 items-center max-w-4xl mx-auto w-full relative">
            <select 
              value={mode} 
              onChange={e => setMode(e.target.value)}
              className="bg-[#1a1a1a] text-gray-300 border border-[#333] rounded-lg px-3 py-3 text-sm outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-all disabled:opacity-50"
              disabled={status === 'running'}
            >
              <option value="auto">Auto</option>
              <option value="research">Research</option>
              <option value="code">Code</option>
            </select>

            <select 
              value={selectedModel} 
              onChange={e => setSelectedModel(e.target.value)}
              className="bg-[#1a1a1a] text-gray-300 border border-[#333] rounded-lg px-3 py-3 text-sm outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-all disabled:opacity-50"
              disabled={status === 'running'}
              title="Select AI model"
            >
              {availableModels.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>

            <button
              onClick={() => setEnergyMode(prev => prev === 'high' ? 'low' : 'high')}
              className={`px-3 py-3 rounded-lg text-sm border transition-all ${
                energyMode === 'high' 
                  ? 'bg-blue-600/20 border-blue-500/30 text-blue-300' 
                  : 'bg-orange-600/20 border-orange-500/30 text-orange-300'
              } disabled:opacity-50`}
              disabled={status === 'running'}
              title={energyMode === 'high' ? 'High Energy: Detailed responses' : 'Low Energy: Concise responses'}
            >
              {energyMode === 'high' ? '⚡ HIGH' : '🔋 LOW'}
            </button>

            <button
              onClick={() => setBrainDumpMode(prev => !prev)}
              className={`px-3 py-3 rounded-lg text-sm border transition-all ${
                brainDumpMode 
                  ? 'bg-purple-600/20 border-purple-500/30 text-purple-300' 
                  : 'bg-[#1a1a1a] text-gray-300 border-[#333]'
              } disabled:opacity-50`}
              disabled={status === 'running'}
              title={brainDumpMode ? 'Brain Dump Mode: ON - Will decompose vague goals into checklist' : 'Brain Dump Mode: OFF'}
            >
              {brainDumpMode ? '🧠 DUMP ON' : '🧠 DUMP'}
            </button>
            
            <div className="flex-1 relative group">
              <input
                className="w-full bg-[#1a1a1a] text-gray-200 border border-[#333] rounded-lg pl-4 pr-12 py-3 text-[15px] outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-all disabled:opacity-50 placeholder-gray-600 shadow-inner"
                placeholder="Enter objective..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && status !== 'running' && route()}
                disabled={status === 'running'}
                autoFocus
              />
            </div>
            
            <button 
              onClick={route} 
              disabled={!input.trim() || status === 'running'}
              className="bg-blue-600 hover:bg-blue-500 text-white rounded-lg p-3 shadow-md border-none cursor-pointer transition-all disabled:opacity-50 flex items-center justify-center disabled:cursor-not-allowed hover:-translate-y-px active:translate-y-0"
            >
              {status === 'running' ? <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" /> : <Send size={18} className="ml-0.5" />}
            </button>
          </div>
          
          {/* STATUS LINE */}
          <div className="mt-3 flex items-center justify-between max-w-4xl mx-auto w-full text-xs text-gray-500 uppercase tracking-wider font-mono">
            <div className="flex items-center gap-2">
              {status === 'idle' && <><span className="w-2 h-2 rounded-full bg-gray-600" /> IDLE</>}
              {status === 'running' && (
                <><span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /> {activeAgent ? `RUNNING: ${activeAgent}` : 'RUNNING...'}</>
              )}
              {status === 'complete' && <><span className="w-2 h-2 rounded-full bg-green-500" /> COMPLETE</>}
              {status === 'error' && <><span className="w-2 h-2 rounded-full bg-red-500" /> ERROR</>}
              {status === 'running' && (
                <span className={`ml-2 ${wsConnected ? 'text-green-400' : 'text-gray-600'}`}>
                  ● {wsConnected ? 'TRACE' : 'NO TRACE'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {status === 'complete' && debugData.latency > 0 && (
                <span className="opacity-70">— {debugData.latency}ms</span>
              )}
              <span className="opacity-50">|</span>
              <span className="text-green-400/80">{activeProvider.toUpperCase()}</span>
            </div>
          </div>
        </div>
      </section>

      {/* DEBUG DRAWER */}
      {!debugOpen ? (
        <div 
          onClick={() => setDebugOpen(true)} 
          className="w-12 border-l border-[#222] bg-[#0a0a0a] flex flex-col items-center py-6 cursor-pointer hover:bg-[#111] transition-colors"
          title="Expand Debug Trace"
        >
          <ChevronsLeft size={18} className="text-gray-500 hover:text-gray-300 transition-colors" />
          <div className="mt-8 text-[11px] text-gray-600 tracking-widest font-mono" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
            DEBUG TRACE
          </div>
        </div>
      ) : (
        <aside className="w-80 border-l border-[#222] bg-[#0a0a0a] flex flex-col transition-all">
          <div className="p-4 border-b border-[#222] flex justify-between items-center bg-[#111]">
            <span className="text-sm font-semibold text-gray-200 tracking-wide font-mono">Trace & Telemetry</span>
            <button onClick={() => setDebugOpen(false)} className="text-gray-400 hover:text-white p-1 rounded hover:bg-white/5 transition-colors">
              <ChevronsRight size={18} />
            </button>
          </div>
          
          <div className="p-4 border-b border-[#222] flex gap-4 text-xs font-mono text-gray-400 bg-black/40">
            <div className="flex flex-col gap-1">
              <span className="uppercase text-[9px] tracking-widest text-gray-600">Loops</span>
              <span className="text-gray-200">{debugData.loops}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="uppercase text-[9px] tracking-widest text-gray-600">Latency</span>
              <span className="text-gray-200">{debugData.latency}ms</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="uppercase text-[9px] tracking-widest text-gray-600">Term</span>
              <span className="text-gray-200 truncate max-w-[80px]" title={debugData.termination}>{debugData.termination}</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0a0a0a]">
            {debugData.events.length === 0 ? (
              <div className="text-gray-600 text-xs text-center py-8">No trace data available.</div>
            ) : (
              [...debugData.events].reverse().map((ev, i) => renderDebugEvent(ev, i))
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
