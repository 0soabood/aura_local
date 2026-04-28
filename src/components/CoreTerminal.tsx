import { useState, useEffect, useRef } from 'react';
import { Terminal, Send, ChevronsRight, ChevronsLeft, AlertTriangle, History, Plus } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { BlackboardEvent, OrchestrateResponse } from '../shared/types';

const getAura = () => (window as any).aura;

/**
 * Dedicated client helper to consume the SSE streaming orchestrator endpoint.
 * Decouples the low-level byte parsing from the React render cycle.
 */
async function streamOrchestrate(
  payload: { message: string; sessionId: string | null; debug?: boolean },
  onEvent: (event: string, data: any) => void
) {
  if (getAura().streamOrchestrate) {
    return getAura().streamOrchestrate(payload, onEvent);
  }

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
  updated_at: string;
}

export default function CoreTerminal() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'running' | 'complete' | 'error'>('idle');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState('auto');
  
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugData, setDebugData] = useState<DebugData>({ events: [], latency: 0, loops: 0, termination: 'none' });

  const [sessions, setSessions] = useState<Session[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [messages, status]);

  const loadSessions = async () => {
    try {
      const data = getAura().listSessions ? await getAura().listSessions() : [];
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
      const events: BlackboardEvent[] = await getAura().getSessionEvents(id);
      const loadedMessages = events
        .filter(e => e.event_type === 'user_message' || e.event_type === 'synthesis_complete' || e.event_type === 'escalation_required')
        .map(e => ({
          id: e.id.toString(),
          role: e.event_type === 'user_message' ? 'user' : (e.event_type === 'escalation_required' ? 'error' : ('assistant' as const)),
          content: e.event_type === 'escalation_required' ? (JSON.parse(e.content).reason || e.content) : e.content
        }));
      setMessages(loadedMessages);
    } catch (err) {
      console.error('Failed to load session events:', err);
    }
  };

  const newSession = () => {
    setActiveId(null);
    setMessages([]);
    setStatus('idle');
    setDebugData({ events: [], latency: 0, loops: 0, termination: 'none' });
  };

  const route = async () => {
    const text = input.trim();
    if (!text || status === 'running') return;

    setInput('');
    setStatus('running');
    
    const userMsgId = crypto.randomUUID();
    setMessages(prev => [...prev, { id: userMsgId, role: 'user', content: text }]);

    try {
      // Prefix mode directive if explicit routing is requested
      const routedMessage = mode === 'auto' ? text : `[Focus: ${mode}] ${text}`;
      
      await streamOrchestrate(
        { message: routedMessage, sessionId: activeId, debug: true },
        (eventType, data) => {
          if (eventType === 'done') {
            setActiveId(data.sessionId);
            setMessages(prev => [...prev, { 
              id: crypto.randomUUID(), role: 'assistant', content: data.finalResponse 
            }]);
            setDebugData({
              events: data.events || [], latency: data.totalLatencyMs, loops: data.totalLoops, termination: data.terminationReason
            });
            setStatus('complete');
            loadSessions();
          } else if (eventType === 'error') {
            setMessages(prev => [...prev, { 
              id: crypto.randomUUID(), role: 'error', content: data.message || 'Orchestration error' 
            }]);
            setStatus('error');
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
    }
  };

  const renderDebugEvent = (ev: BlackboardEvent, i: number) => (
    <div key={i} className="activity" style={{ marginBottom: 8, padding: 8, background: 'var(--bg-2)', borderRadius: 4 }}>
      <div style={{ fontSize: '10px', color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase' }}>
        <strong>{ev.author}</strong> · {ev.event_type}
      </div>
      <div style={{ fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: 'var(--text-2)' }}>
        {ev.content.length > 200 ? ev.content.slice(0, 200) + '...' : ev.content}
      </div>
    </div>
  );

  return (
    <div className={`terminal ${!debugOpen ? 'right-collapsed' : ''} ${!historyOpen ? 'left-collapsed' : ''}`} style={{ display: 'flex', height: '100%', width: '100%' }}>
      
      {/* HISTORY DRAWER */}
      {!historyOpen ? (
        <div 
          onClick={() => { setHistoryOpen(true); loadSessions(); }} 
          style={{ width: '40px', borderRight: '1px solid var(--border-1)', background: 'var(--bg-2)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', cursor: 'pointer' }}
          title="Expand History"
        >
          <History size={16} color="var(--text-3)" />
          <div style={{ writingMode: 'vertical-rl', marginTop: '24px', fontSize: '11px', color: 'var(--text-3)', letterSpacing: '1px' }}>
            HISTORY
          </div>
        </div>
      ) : (
        <aside style={{ width: '250px', borderRight: '1px solid var(--border-1)', background: 'var(--bg-1)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-1)' }}>Sessions</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={newSession} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer' }} title="New Session">
                <Plus size={16} />
              </button>
              <button onClick={() => setHistoryOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer' }}>
                <ChevronsLeft size={16} />
              </button>
            </div>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {sessions.length === 0 ? (
              <div style={{ color: 'var(--text-4)', fontSize: '11px', textAlign: 'center', padding: '16px' }}>No history.</div>
            ) : (
              sessions.map(s => (
                <div 
                  key={s.id} 
                  onClick={() => selectSession(s.id)}
                  style={{ 
                    padding: '10px', 
                    marginBottom: '4px', 
                    borderRadius: '4px', 
                    background: activeId === s.id ? 'var(--bg-2)' : 'transparent',
                    cursor: 'pointer',
                    fontSize: '12px',
                    color: activeId === s.id ? 'var(--text-1)' : 'var(--text-3)'
                  }}
                >
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Session {s.id.slice(0, 8)}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-4)', marginTop: '4px' }}>
                    {new Date(s.updated_at).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      )}

      {/* MAIN FEED */}
      <section className="feed" style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <div className="feed-stream" ref={feedRef} style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {messages.length === 0 && status !== 'running' ? (
            <div className="feed-empty" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center', color: 'var(--text-3)' }}>
                <Terminal size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
                <h2>AURA Shell Ready</h2>
                <p style={{ fontSize: '13px' }}>Select a mode and enter an objective to begin.</p>
              </div>
            </div>
          ) : (
            messages.map(msg => (
              <div key={msg.id} style={{
                marginBottom: '20px', display: 'flex', flexDirection: 'column',
                alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start'
              }}>
                <div style={{
                  maxWidth: '85%', padding: '12px 16px', borderRadius: '8px',
                  background: msg.role === 'user' ? 'var(--accent)' : (msg.role === 'error' ? 'rgba(239,68,68,0.1)' : 'var(--bg-2)'),
                  color: msg.role === 'user' ? '#fff' : (msg.role === 'error' ? '#fca5a5' : 'var(--text-1)'),
                  border: msg.role === 'error' ? '1px solid var(--red-d)' : '1px solid transparent'
                }}>
                  {msg.role === 'assistant' ? (
                    <div className="markdown-body prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : msg.role === 'error' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '13px' }}>
                      <AlertTriangle size={14} /> {msg.content}
                    </div>
                  ) : (
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '14px' }}>{msg.content}</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* INPUT COMPOSER */}
        <div className="composer" style={{ padding: '16px', background: 'var(--bg-1)', borderTop: '1px solid var(--border-1)' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select 
              value={mode} 
              onChange={e => setMode(e.target.value)}
              style={{ padding: '8px', borderRadius: '4px', background: 'var(--bg-2)', color: 'var(--text-1)', border: '1px solid var(--border-2)', outline: 'none', cursor: status === 'running' ? 'not-allowed' : 'pointer' }}
              disabled={status === 'running'}
            >
              <option value="auto">Auto</option>
              <option value="research">Research</option>
              <option value="code">Code</option>
            </select>
            
            <input
              style={{ flex: 1, padding: '10px 14px', borderRadius: '4px', background: 'var(--bg-2)', color: 'var(--text-1)', border: '1px solid var(--border-2)', outline: 'none', cursor: status === 'running' ? 'not-allowed' : 'text' }}
              placeholder="Enter objective..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && status !== 'running' && route()}
              disabled={status === 'running'}
              autoFocus
            />
            
            <button 
              onClick={route} 
              disabled={!input.trim() || status === 'running'}
              style={{ padding: '10px 16px', borderRadius: '4px', background: 'var(--accent)', color: '#fff', border: 'none', cursor: (!input.trim() || status === 'running') ? 'not-allowed' : 'pointer', opacity: (!input.trim() || status === 'running') ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Send size={16} />
            </button>
          </div>
          
          {/* STATUS LINE */}
          <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {status === 'idle' && <><span className="dot idle" /> IDLE</>}
              {status === 'running' && <><span className="dot live" /> RUNNING...</>}
              {status === 'complete' && <><span className="dot ok" /> COMPLETE</>}
              {status === 'error' && <><span className="dot err" /> ERROR</>}
            </div>
            {status === 'complete' && debugData.latency > 0 && (
              <span style={{ color: 'var(--text-4)' }}>— {debugData.latency}ms</span>
            )}
          </div>
        </div>
      </section>

      {/* DEBUG DRAWER */}
      {!debugOpen ? (
        <div 
          onClick={() => setDebugOpen(true)} 
          style={{ width: '40px', borderLeft: '1px solid var(--border-1)', background: 'var(--bg-2)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', cursor: 'pointer' }}
          title="Expand Debug Trace"
        >
          <ChevronsLeft size={16} color="var(--text-3)" />
          <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', marginTop: '24px', fontSize: '11px', color: 'var(--text-3)', letterSpacing: '1px' }}>
            DEBUG TRACE
          </div>
        </div>
      ) : (
        <aside style={{ width: '350px', borderLeft: '1px solid var(--border-1)', background: 'var(--bg-1)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-1)' }}>Debug Trace</span>
            <button onClick={() => setDebugOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer' }}>
              <ChevronsRight size={16} />
            </button>
          </div>
          
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border-1)', display: 'flex', gap: '16px', fontSize: '11px', color: 'var(--text-2)' }}>
            <div><strong>Loops:</strong> {debugData.loops}</div>
            <div><strong>Latency:</strong> {debugData.latency}ms</div>
            <div><strong>Term:</strong> {debugData.termination}</div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            {debugData.events.length === 0 ? (
              <div style={{ color: 'var(--text-4)', fontSize: '11px', textAlign: 'center' }}>No trace data available.</div>
            ) : (
              [...debugData.events].reverse().map((ev, i) => renderDebugEvent(ev, i))
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
