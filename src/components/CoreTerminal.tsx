import { useState, useEffect, useRef } from 'react';
import { Terminal, Send, ChevronsRight, ChevronsLeft, AlertTriangle, History, Plus, Cog } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { BlackboardEvent } from '../shared/types';
import { DebugPanel } from './DebugPanel';
import { ChatMessage } from './ChatMessage';
import { useBrainDumpMode, useSetBrainDumpMode, useSelectedModel, useSetSelectedModel } from '../stores/useAura';
import SettingsPanel from './settings/SettingsPanel';

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
  
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugData, setDebugData] = useState<DebugData>({ events: [], latency: 0, loops: 0, termination: 'none' });

  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<string>('checking...');
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const [energyMode, setEnergyMode] = useState<'low' | 'high'>('high');
  const [settingsOpen, setSettingsOpen] = useState(false);
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
          // Fallback to hardcoded list if API fails
          setModelProviders([
            {
              id: 'google',
              name: 'GOOGLE',
              hasKey: true,
              models: [
                { id: 'google:gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
              ],
            },
            {
              id: 'vertex',
              name: 'VERTEX',
              hasKey: true,
              models: [
                { id: 'vertex:gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
              ],
            },
            {
              id: 'openrouter',
              name: 'OPENROUTER',
              hasKey: false,
              models: [
                { id: 'openrouter:meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B' },
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

            {/* Model Selector with Provider Grouping */}
            <select
              value={selectedModel}
              onChange={e => setSelectedModel(e.target.value)}
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
                minWidth: '200px',
              }}
              disabled={status === 'running'}
              title="Select AI model"
            >
              <option value="auto">AUTO (DEFAULT)</option>
              {modelProviders.map(provider => (
                <optgroup key={provider.id} label={`${provider.name}${!provider.hasKey ? ' 🔒' : ''}`}>
                  {provider.models.map(model => (
                    <option key={model.id} value={model.id}>
                      {model.label.toUpperCase()}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            <button
              onClick={() => setSettingsOpen(true)}
              style={{
                padding: '0.75rem',
                borderRadius: '0.5rem',
                border: 'var(--rule-thick)',
                background: 'var(--bone)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Model Settings"
              disabled={status === 'running'}
            >
              <Cog size={16} />
            </button>

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
              <span style={{ color: 'var(--chartreuse)' }}>{activeProvider.toUpperCase()}</span>
            </div>
          </div>
        </div>
      </section>

      {/* DEBUG DRAWER */}
      {!debugOpen ? (
        <div 
          onClick={() => setDebugOpen(true)} 
          style={{
            width: '3rem',
            borderLeft: 'var(--rule-thick)',
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
          title="Expand Debug Trace"
        >
          <ChevronsLeft size={18} style={{ color: 'var(--bone)', opacity: 0.5 }} />
          <div style={{
            marginTop: '2rem',
            fontSize: '0.6875rem',
            color: 'var(--bone)',
            opacity: 0.6,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.1em',
            writingMode: 'vertical-rl' as const,
            transform: 'rotate(180deg)',
          }}>
            DEBUG TRACE
          </div>
        </div>
      ) : (
        <aside style={{
          width: '20rem',
          borderLeft: 'var(--rule-thick)',
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
              fontFamily: 'var(--font-mono)',
            }}>TRACE & TELEMETRY</span>
            <button onClick={() => setDebugOpen(false)} style={{
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
              <ChevronsRight size={18} />
            </button>
          </div>
          
          <div style={{
            padding: '1rem',
            borderBottom: 'var(--rule-thick)',
            display: 'flex',
            gap: '1rem',
            fontSize: '0.75rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--bone)',
            opacity: 0.6,
            backgroundColor: 'rgba(0,0,0,0.4)',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span style={{ textTransform: 'uppercase' as const, fontSize: '0.5625rem', letterSpacing: '0.1em', opacity: 0.6 }}>LOOPS</span>
              <span style={{ color: 'var(--bone)', opacity: 1 }}>{debugData.loops}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span style={{ textTransform: 'uppercase' as const, fontSize: '0.5625rem', letterSpacing: '0.1em', opacity: 0.6 }}>LATENCY</span>
              <span style={{ color: 'var(--bone)', opacity: 1 }}>{debugData.latency}ms</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span style={{ textTransform: 'uppercase' as const, fontSize: '0.5625rem', letterSpacing: '0.1em', opacity: 0.6 }}>TERM</span>
              <span style={{ color: 'var(--bone)', opacity: 1, overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '5rem' }} title={debugData.termination}>{debugData.termination}</span>
            </div>
          </div>

          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            backgroundColor: 'var(--ink)',
          }}>
            {debugData.events.length === 0 ? (
              <div style={{
                color: 'var(--bone)',
                opacity: 0.6,
                fontSize: '0.75rem',
                textAlign: 'center',
                padding: '2rem 0',
              }}>NO TRACE DATA AVAILABLE.</div>
            ) : (
              [...debugData.events].reverse().map((ev, i) => renderDebugEvent(ev, i))
            )}
          </div>
        </aside>
      )}

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        modelProviders={modelProviders}
      />
    </div>
  );
}
