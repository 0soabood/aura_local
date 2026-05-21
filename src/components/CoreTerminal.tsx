import { useState, useEffect, useRef } from 'react';
import { Terminal, Send, ChevronsRight, ChevronsLeft, AlertTriangle, History, Plus, Cog } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { BlackboardEvent } from '../shared/types';
import { DebugPanel } from './DebugPanel';
import { ChatMessage } from './ChatMessage';
import { useBrainDumpMode, useSetBrainDumpMode, useSelectedModel, useSetSelectedModel } from '../stores/useAura';
import { VetoPanel } from './VetoPanel';

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
  model?: string;
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
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const modelPickerRef = useRef<HTMLDivElement>(null);
  
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugData, setDebugData] = useState<DebugData>({ events: [], latency: 0, loops: 0, termination: 'none' });

  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<string>('checking...');
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const [energyMode, setEnergyMode] = useState<'low' | 'high'>('high');
  const [vetoPanelOpen, setVetoPanelOpen] = useState(false);
  // Use Zustand store for brainDumpMode and model selection
  const brainDumpMode = useBrainDumpMode();
  const setBrainDumpMode = useSetBrainDumpMode();
  const selectedModel = useSelectedModel();
  const setSelectedModel = useSetSelectedModel();

  // Dynamic models fetched from API (grouped by provider)
  interface ProviderGroup {
    id: string;
    name: string;
    hasKey: boolean;
    models: Array<{ id: string; label: string }>;
  }

  const [modelProviders, setModelProviders] = useState<ProviderGroup[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);

  // Fetch available models on mount
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const aura = getAura();
        let modelsData;

        if (aura?.getAvailableModels) {
          modelsData = await aura.getAvailableModels();
        } else {
          const res = await fetch('/api/models');
          modelsData = res.ok ? await res.json() : null;
        }

        if (modelsData && Array.isArray(modelsData.providers)) {
          setModelProviders(modelsData.providers);
        } else {
          // Fallback to a single OpenRouter group if the API is unavailable.
          setModelProviders([
            {
              id: 'openrouter',
              name: 'OPENROUTER',
              hasKey: true,
              models: [
                { id: 'openrouter:google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
                { id: 'openrouter:meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (Free)' },
                { id: 'openrouter:deepseek/deepseek-chat', label: 'DeepSeek Chat' },
              ],
            },
          ]);
        }
      } catch (err) {
        console.error('Failed to fetch models:', err);
      } finally {
        setModelsLoading(false);
      }
    };

    fetchModels();
  }, []);

  // Close model picker on outside click
  useEffect(() => {
    if (!modelPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setModelPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [modelPickerOpen]);

  // Helper to get the display label for the selected model
  const getSelectedModelLabel = () => {
    if (selectedModel === 'auto') return 'AUTO (DEFAULT)';
    const model = modelProviders
      .flatMap(p => p.models)
      .find(m => m.id === selectedModel);
    return model ? model.label.toUpperCase() : selectedModel.toUpperCase();
  };

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
        routedMessage = `[BRAIN DUMP MODE] The user has provided a vague goal or idea: "${text}".\n\n` +
          `Break it down into a structured, actionable checklist with clear steps. ` +
          `Format as a markdown checklist with - [ ] for incomplete items. Do not start working on the steps, just provide the checklist.`;
        console.log('[Brain Dump Mode] Decomposing vague goal into checklist...');
        setBrainDumpMode(false); // Auto-toggle off after single use
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
            // Include model info in the message for display
            const modelInfo = data.model || selectedModel || 'auto';
            setMessages(prev => [...prev, {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: data.finalResponse,
              model: modelInfo // Store model info with message
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
    <div style={{
      display: 'flex',
      height: '100%',
      width: '100%',
      backgroundColor: 'var(--ink)',
      overflow: 'hidden',
    }}>
      
      {/* HISTORY DRAWER */}
      {!historyOpen ? (
        <div 
          onClick={() => { setHistoryOpen(true); loadSessions(); }} 
          style={{
            width: '3rem',
            borderRight: 'var(--rule-thick)',
            backgroundColor: 'var(--ink)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: '1.5rem',
            cursor: 'pointer',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--ink)'; }}
          title="Expand History"
        >
          <History size={18} style={{ color: 'var(--bone)', opacity: 0.5 }} />
          <div style={{
            marginTop: '2rem',
            fontSize: '0.6875rem',
            color: 'var(--bone)',
            opacity: 0.6,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.1em',
            writingMode: 'vertical-rl' as const,
          }}>
            HISTORY
          </div>
        </div>
      ) : (
        <aside style={{
          width: '16rem',
          borderRight: 'var(--rule-thick)',
          backgroundColor: 'var(--ink)',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{
            padding: '1rem',
            borderBottom: 'var(--rule-thick)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'rgba(255,255,255,0.05)',
          }}>
            <span style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--bone)',
              letterSpacing: '0.05em',
            }}>SESSIONS</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={newSession} style={{
                color: 'var(--bone)',
                opacity: 0.6,
                padding: '0.25rem',
                borderRadius: '0.25rem',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }} onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.backgroundColor = 'transparent'; }}
              title="New Session">
                <Plus size={18} />
              </button>
              <button onClick={() => setHistoryOpen(false)} style={{
                color: 'var(--bone)',
                opacity: 0.6,
                padding: '0.25rem',
                borderRadius: '0.25rem',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }} onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.backgroundColor = 'transparent'; }}>
                <ChevronsLeft size={18} />
              </button>
            </div>
          </div>
          
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
          }}>
            {sessions.length === 0 ? (
              <div style={{
                color: 'var(--bone)',
                opacity: 0.6,
                fontSize: '0.75rem',
                textAlign: 'center',
                padding: '1rem',
              }}>NO HISTORY.</div>
            ) : (
              sessions.map(s => {
                const isResumed = s.state === 'done' || s.state === 'error';
                const isActive = activeId === s.id;
                return (
                <div 
                  key={s.id} 
                  onClick={() => selectSession(s.id)}
                  style={{
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    transition: 'all 0.2s',
                    border: 'var(--rule-thick)',
                    backgroundColor: isActive ? 'rgba(59, 76, 202, 0.1)' : 'transparent',
                    borderColor: isActive ? 'rgba(59, 76, 202, 0.2)' : 'transparent',
                    color: isActive ? 'var(--bone)' : 'var(--bone)',
                    opacity: isActive ? 1 : 0.6,
                  }}
                  onMouseEnter={(e) => { 
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; 
                      e.currentTarget.style.color = 'var(--bone)';
                      e.currentTarget.style.opacity = '1';
                    }
                  }}
                  onMouseLeave={(e) => { 
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'transparent'; 
                      e.currentTarget.style.color = 'var(--bone)';
                      e.currentTarget.style.opacity = '0.6';
                    }
                  }}
                >
                  <div style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: 500,
                  }} title={s.title || s.name || `Session ${s.id.slice(0, 8)}`}>
                    {s.title || s.name || `Session ${s.id.slice(0, 8)}`}
                  </div>
                  <div style={{
                    fontSize: '0.6875rem',
                    marginTop: '0.375rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontFamily: 'var(--font-mono)',
                    opacity: 0.75,
                  }}>
                    <span>{new Date(s.updated_at).toLocaleDateString()}</span>
                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                      {isResumed && (
                        <span style={{
                          padding: '0.125rem 0.375rem',
                          borderRadius: '0.125rem',
                          fontSize: '0.5625rem',
                          textTransform: 'uppercase' as const,
                          letterSpacing: '0.1em',
                          backgroundColor: 'rgba(245, 197, 66, 0.2)',
                          color: 'var(--marigold)',
                          fontWeight: 700,
                        }} title="Resumable session">
                          ↻
                        </span>
                      )}
                      {s.state && (
                        <span style={{
                          padding: '0.125rem 0.375rem',
                          borderRadius: '0.125rem',
                          fontSize: '0.5625rem',
                          textTransform: 'uppercase' as const,
                          letterSpacing: '0.1em',
                          backgroundColor: s.state === 'running' ? 'rgba(59, 76, 202, 0.2)' : 
                                         s.state === 'error' ? 'rgba(220, 38, 38, 0.2)' : 
                                         'rgba(255,255,255,0.05)',
                          color: s.state === 'running' ? 'var(--ultramarine)' : 
                                 s.state === 'error' ? 'var(--oxblood)' : 
                                 'var(--bone)',
                          fontWeight: 700,
                          animation: s.state === 'running' ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none',
                        }}>
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
      <section style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        backgroundColor: 'var(--ink)',
      }}>
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.5rem 1.5rem',
          scrollBehavior: 'smooth',
        }} ref={feedRef}>
          {messages.length === 0 && status !== 'running' ? (
            <div style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <div style={{
                textAlign: 'center',
                color: 'var(--bone)',
                opacity: 0.6,
              }}>
                <Terminal size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                <h2 style={{
                  fontSize: '1.125rem',
                  fontWeight: 500,
                  letterSpacing: '0.05em',
                  margin: 0,
                  color: 'var(--bone)',
                }}>AURA SHELL READY</h2>
                <p style={{
                  fontSize: '0.875rem',
                  marginTop: '0.5rem',
                  opacity: 0.7,
                  color: 'var(--bone)',
                }}>SELECT A SESSION OR ENTER AN OBJECTIVE TO BEGIN.</p>
              </div>
            </div>
          ) : (
            messages.map(msg => {
              // Convert Message to BlackboardEvent for ChatMessage component
              const event: BlackboardEvent = {
                id: typeof msg.id === 'string' ? parseInt(msg.id) || Date.now() : msg.id,
                session_id: activeId || 'temp',
                seq: 0,
                event_type: msg.role === 'user' ? 'user_message' :
                            msg.role === 'error' ? 'escalation_required' :
                            'synthesis_complete',
                author: msg.role === 'user' ? 'user' :
                         msg.role === 'error' ? 'orchestrator' :
                         'synthesis_agent',
                content: msg.content,
                created_at: new Date().toISOString(),
                metadata: msg.model ? JSON.stringify({ model: msg.model }) : null,
              };
              return (
                <ChatMessage
                  key={msg.id}
                  event={event}
                  isStreaming={status === 'running'}
                />
              );
            })
          )}
        </div>

        {/* INPUT COMPOSER */}
        <div style={{
          padding: '1rem',
          backgroundColor: 'var(--ink)',
          borderTop: 'var(--rule-thick)',
        }}>
          <div style={{
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'center',
            maxWidth: '56rem',
            margin: '0 auto',
            width: '100%',
            position: 'relative',
          }}>
            <select 
              value={mode} 
              onChange={e => setMode(e.target.value)}
              style={{
                backgroundColor: 'var(--bone)',
                color: 'var(--ink)',
                border: 'var(--rule-thick)',
                borderRadius: '0.5rem',
                padding: '0.75rem',
                fontSize: '0.875rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                outline: 'none',
                cursor: status === 'running' ? 'not-allowed' : 'pointer',
                opacity: status === 'running' ? 0.5 : 1,
              }}
              disabled={status === 'running'}
            >
              <option value="auto">AUTO</option>
              <option value="research">RESEARCH</option>
              <option value="code">CODE</option>
            </select>

            {/* Model Selector — searchable dropdown */}
            <div ref={modelPickerRef} style={{ position: 'relative' }}>
              <button
                onClick={() => { if (status !== 'running') { setModelPickerOpen(v => !v); setModelSearch(''); } }}
                disabled={status === 'running'}
                style={{
                  backgroundColor: 'var(--bone)',
                  color: 'var(--ink)',
                  border: 'var(--rule-thick)',
                  borderRadius: '0.5rem',
                  padding: '0.75rem',
                  fontSize: '0.875rem',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  cursor: status === 'running' ? 'not-allowed' : 'pointer',
                  opacity: status === 'running' ? 0.5 : 1,
                  minWidth: '200px',
                  textAlign: 'left',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
                title="Select AI model"
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>
                  {getSelectedModelLabel()}
                </span>
                <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>{modelPickerOpen ? '▲' : '▼'}</span>
              </button>

              {modelPickerOpen && (
                <div style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 4px)',
                  left: 0,
                  zIndex: 9999,
                  background: 'var(--bone)',
                  border: 'var(--rule-thick)',
                  borderRadius: '0.5rem',
                  width: '320px',
                  maxHeight: '420px',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: '4px 4px 0 var(--ink)',
                }}>
                  <div style={{ padding: '0.5rem', borderBottom: '2px solid var(--ink)' }}>
                    <input
                      autoFocus
                      type="text"
                      placeholder="Search models..."
                      value={modelSearch}
                      onChange={e => setModelSearch(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        border: '2px solid var(--ink)',
                        borderRadius: '0.25rem',
                        background: 'var(--surface, #f5f5f5)',
                        color: 'var(--ink)',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div style={{ overflowY: 'auto', flex: 1 }}>
                    {/* AUTO option */}
                    {('auto'.includes(modelSearch.toLowerCase()) || 'default'.includes(modelSearch.toLowerCase())) && (
                      <div
                        onClick={() => { setSelectedModel('auto'); setModelPickerOpen(false); }}
                        style={{
                          padding: '0.5rem 0.75rem',
                          cursor: 'pointer',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.8rem',
                          fontWeight: selectedModel === 'auto' ? 800 : 600,
                          background: selectedModel === 'auto' ? 'var(--ink)' : 'transparent',
                          color: selectedModel === 'auto' ? 'var(--bone)' : 'var(--ink)',
                          borderBottom: '1px solid rgba(0,0,0,0.1)',
                        }}
                        onMouseEnter={e => { if (selectedModel !== 'auto') (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.08)'; }}
                        onMouseLeave={e => { if (selectedModel !== 'auto') (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                      >
                        AUTO (DEFAULT)
                      </div>
                    )}
                    {modelProviders.map(provider => {
                      const filtered = provider.models.filter(m =>
                        m.label.toLowerCase().includes(modelSearch.toLowerCase()) ||
                        m.id.toLowerCase().includes(modelSearch.toLowerCase())
                      );
                      if (filtered.length === 0) return null;
                      return (
                        <div key={provider.id}>
                          <div style={{
                            padding: '0.35rem 0.75rem',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.65rem',
                            fontWeight: 800,
                            letterSpacing: '0.12em',
                            opacity: 0.5,
                            background: 'rgba(0,0,0,0.04)',
                            textTransform: 'uppercase',
                          }}>
                            {provider.name}{!provider.hasKey ? ' 🔒' : ''}
                          </div>
                          {filtered.map(model => (
                            <div
                              key={model.id}
                              onClick={() => { setSelectedModel(model.id); setModelPickerOpen(false); }}
                              style={{
                                padding: '0.45rem 0.75rem 0.45rem 1.25rem',
                                cursor: 'pointer',
                                fontFamily: 'var(--font-mono)',
                                fontSize: '0.78rem',
                                fontWeight: selectedModel === model.id ? 800 : 500,
                                background: selectedModel === model.id ? 'var(--ink)' : 'transparent',
                                color: selectedModel === model.id ? 'var(--bone)' : 'var(--ink)',
                                borderBottom: '1px solid rgba(0,0,0,0.06)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              onMouseEnter={e => { if (selectedModel !== model.id) (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.08)'; }}
                              onMouseLeave={e => { if (selectedModel !== model.id) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                              title={model.id}
                            >
                              {model.label}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                    {modelSearch && modelProviders.every(p => p.models.filter(m =>
                      m.label.toLowerCase().includes(modelSearch.toLowerCase()) ||
                      m.id.toLowerCase().includes(modelSearch.toLowerCase())
                    ).length === 0) && (
                      <div style={{ padding: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', opacity: 0.5, textAlign: 'center' }}>
                        No models match "{modelSearch}"
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setEnergyMode(prev => prev === 'high' ? 'low' : 'high')}
              style={{
                padding: '0.75rem',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                border: 'var(--rule-thick)',
                cursor: status === 'running' ? 'not-allowed' : 'pointer',
                opacity: status === 'running' ? 0.5 : 1,
                transition: 'all 0.2s',
                backgroundColor: energyMode === 'high' ? 'var(--ultramarine)' : 'var(--marigold)',
                color: energyMode === 'high' ? 'var(--bone)' : 'var(--ink)',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                letterSpacing: '0.05em',
              }}
              disabled={status === 'running'}
              title={energyMode === 'high' ? 'High Energy: Detailed responses' : 'Low Energy: Concise responses'}
            >
              {energyMode === 'high' ? '⚡ HIGH' : '🔋 LOW'}
            </button>

            <button
              onClick={() => setBrainDumpMode(!brainDumpMode)}
              style={{
                padding: '0.75rem',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                border: 'var(--rule-thick)',
                cursor: status === 'running' ? 'not-allowed' : 'pointer',
                opacity: status === 'running' ? 0.5 : 1,
                transition: 'all 0.2s',
                backgroundColor: brainDumpMode ? 'var(--chartreuse)' : 'var(--bone)',
                color: brainDumpMode ? 'var(--ink)' : 'var(--ink)',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                letterSpacing: '0.05em',
              }}
              disabled={status === 'running'}
              title={brainDumpMode ? 'Brain Dump Mode: ON - Will decompose vague goals into checklist' : 'Brain Dump Mode: OFF'}
            >
              {brainDumpMode ? '🧠 DUMP ON' : '🧠 DUMP'}
            </button>

            <button
              onClick={() => setVetoPanelOpen(!vetoPanelOpen)}
              style={{
                padding: '0.75rem',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                border: 'var(--rule-thick)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                backgroundColor: vetoPanelOpen ? 'var(--oxblood)' : 'var(--bone)',
                color: vetoPanelOpen ? 'var(--bone)' : 'var(--ink)',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                letterSpacing: '0.05em',
              }}
              title="Toggle Veto Panel - Pending Approvals"
            >
              ⚠️ VETO
            </button>
            
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                style={{
                  width: '100%',
                  backgroundColor: 'var(--bone)',
                  color: 'var(--ink)',
                  border: 'var(--rule-thick)',
                  borderRadius: '0.5rem',
                  paddingLeft: '1rem',
                  paddingRight: '3rem',
                  paddingTop: '0.75rem',
                  paddingBottom: '0.75rem',
                  fontSize: '0.9375rem',
                  fontFamily: 'var(--font-mono)',
                  outline: 'none',
                  cursor: status === 'running' ? 'not-allowed' : 'text',
                  opacity: status === 'running' ? 0.5 : 1,
                }}
                placeholder="ENTER OBJECTIVE..."
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
              style={{
                backgroundColor: 'var(--oxblood)',
                color: 'var(--bone)',
                borderRadius: '0.5rem',
                padding: '0.75rem',
                border: 'var(--rule-thick)',
                cursor: !input.trim() || status === 'running' ? 'not-allowed' : 'pointer',
                opacity: !input.trim() || status === 'running' ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'var(--shadow-hard)',
                transition: 'transform 0.1s',
              }}
              onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.transform = 'translate(-1px, -1px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translate(0, 0)'; }}
              onMouseDown={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.transform = 'translate(1px, 1px)'; }}
              onMouseUp={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.transform = 'translate(-1px, -1px)'; }}
            >
              {status === 'running' ? <div style={{ width: '1rem', height: '1rem', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /> : <Send size={18} />}
            </button>
          </div>
          
          {/* STATUS LINE */}
          <div style={{
            marginTop: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            maxWidth: '56rem',
            margin: '0.75rem auto 0',
            width: '100%',
            fontSize: '0.6875rem',
            color: 'var(--bone)',
            opacity: 0.6,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.1em',
            fontFamily: 'var(--font-mono)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {status === 'idle' && <><span style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', backgroundColor: 'var(--bone)', opacity: 0.6 }} /> IDLE</>}
              {status === 'running' && (
                <>
                  <span style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', backgroundColor: 'var(--ultramarine)', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
                  <span style={{ color: 'var(--ultramarine)' }}>ROUTING</span>
                  {activeAgent && <span style={{ color: 'var(--bone)', opacity: 0.6 }}>→ {activeAgent.toUpperCase()}</span>}
                </>
              )}
              {status === 'complete' && <><span style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', backgroundColor: 'var(--chartreuse)' }} /> READY</>}
              {status === 'error' && <><span style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', backgroundColor: 'var(--oxblood)' }} /> ERROR</>}
              {status === 'running' && (
                <span style={{ color: wsConnected ? 'var(--chartreuse)' : 'var(--bone)', opacity: 0.6 }}>
                  ● {wsConnected ? 'TRACE' : 'NO TRACE'}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {status === 'complete' && debugData.latency > 0 && (
                <span style={{ opacity: 0.7 }}>— {debugData.latency}ms</span>
              )}
              <span style={{ opacity: 0.5 }}>|</span>
              <span style={{ color: 'var(--chartreuse)' }}>{activeProvider}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
