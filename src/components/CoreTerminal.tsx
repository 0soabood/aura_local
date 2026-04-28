// src/components/CoreTerminal.tsx
// Brutalist terminal: bionic-bolded prose, tool calls in the right gutter as
// numbered marginalia. SSE streaming via window.aura.streamOrchestrate.

import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Send, Plus, Cpu, Wrench } from 'lucide-react';
import type { Session, OrchestrateEvent } from '../shared/types';
import { Bionic, Spinner, SectionNum } from './ui/atoms';

const getAura = () => (window as any).aura;

interface ToolNote {
  n: number;
  name: string;
  args: string;
  ms?: number;
  ok?: boolean | null;
}

export default function CoreTerminal() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [tokens, setTokens] = useState<string>('');
  const [tools, setTools] = useState<ToolNote[]>([]);
  const counter = useRef(0);

  const fetchData = async () => {
    setLoading(true);
    try {
      const ss = await getAura().listSessionsV2();
      setSessions(ss);
      setActiveId(ss[0]?.id || null);
    } catch (err) {
      console.error('[CoreTerminal]', err);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSend = async () => {
    if (!prompt.trim() || streaming) return;
    setStreaming(true);
    setTokens('');
    setTools([]);
    counter.current = 0;
    try {
      await getAura().streamOrchestrate(
        { sessionId: activeId || undefined, prompt },
        (e: OrchestrateEvent) => {
          if (e.type === 'tool_call') {
            counter.current += 1;
            setTools(prev => [...prev, { n: counter.current, name: e.data.name, args: e.data.args, ok: null }]);
          } else if (e.type === 'tool_result') {
            setTools(prev => prev.map(t => (t.name === e.data.name && t.ok === null) ? { ...t, ms: e.data.ms, ok: e.data.ok } : t));
          } else if (e.type === 'token') {
            setTokens(prev => prev + e.data.text);
          }
        },
      );
    } catch (err) {
      console.error('[CoreTerminal]', err);
    } finally {
      setStreaming(false);
      setPrompt('');
    }
  };

  const active = sessions.find(s => s.id === activeId);
  const stateLabel = (st: Session['state']) =>
    st === 'running' ? 'live' : st === 'error' ? 'error' : 'idle';

  return (
    <div className="page">
      <div className="page-hd">
        <div className="page-hd-title">
          <SectionNum n="01" />
          <b>The Terminal</b>
          <span>{sessions.length} sessions · {sessions.filter(s => s.state === 'running').length} live</span>
        </div>
        <div className="page-hd-actions">
          <span className="row" style={{ gap: 6 }}>
            <span className="dot live" />
            <span className="caps" style={{ color: 'var(--text-2)' }}>SSE OPEN</span>
          </span>
          <span className="caps" style={{ color: 'var(--text-3)' }}>1,824 / 200,000 TOK</span>
          <button className="btn primary" onClick={fetchData}><Plus size={12} /> NEW</button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* LEFT — sessions card catalog */}
        <aside style={{
          width: 260, borderRight: 'var(--rule-thick)', background: 'var(--paper)',
          display: 'flex', flexDirection: 'column',
        }}>
          <div className="row" style={{
            justifyContent: 'space-between', padding: '10px 14px',
            borderBottom: 'var(--rule-thick)', background: 'var(--card-alt)',
          }}>
            <span className="caps">CARD CATALOG</span>
            <span className="caps" style={{ color: 'var(--text-3)' }}>{sessions.length} ENT.</span>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {loading && <Spinner />}
            {sessions.map(s => {
              const isActive = s.id === activeId;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveId(s.id)}
                  style={{
                    background: isActive ? 'var(--card)' : 'transparent',
                    border: '2px solid var(--rule)',
                    boxShadow: isActive ? '4px 4px 0 var(--rule)' : 'none',
                    padding: '8px 10px', textAlign: 'left', cursor: 'pointer',
                    color: 'var(--text)',
                  }}
                >
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)' }}>
                      AC.{s.id.slice(-8).toUpperCase()}
                    </span>
                    <span className="row" style={{ gap: 4 }}>
                      <span className={`dot ${stateLabel(s.state)}`} />
                      <span className="mono" style={{ fontSize: 9 }}>
                        {new Date(s.created_at).toTimeString().slice(0, 5)}
                      </span>
                    </span>
                  </div>
                  <div className="display" style={{ fontSize: 16, marginTop: 4, lineHeight: 1.1 }}>
                    {s.name}
                  </div>
                  <div className="caps" style={{ marginTop: 4, color: 'var(--text-3)', fontSize: 9 }}>
                    {s.state} · {s.model}
                  </div>
                </button>
              );
            })}
            {!loading && sessions.length === 0 && (
              <div className="empty" style={{ fontSize: 10 }}>NO SESSIONS YET</div>
            )}
          </div>
        </aside>

        {/* CENTER — page */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--card)' }}>
          <div style={{ flex: 1, overflow: 'auto', padding: '28px 36px' }}>
            {/* User msg placeholder */}
            <div style={{ marginBottom: 22 }}>
              <div className="caps" style={{ color: 'var(--oxblood)', marginBottom: 6 }}>
                YOU · {active ? new Date(active.created_at).toTimeString().slice(0, 8) : '—'}
              </div>
              <div className="mono" style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-2)' }}>
                {active ? `Session: ${active.name}` : 'Select a session or start typing a directive below.'}
              </div>
            </div>

            <div className="ruler" style={{ marginBottom: 20 }} />

            {/* Streaming output */}
            {(streaming || tokens) && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="caps" style={{ marginBottom: 8, color: 'var(--oxblood)' }}>
                  AURA · {streaming ? 'STILL TYPING' : 'RESPONSE'}
                </div>
                <p className="prose bionic" style={{ margin: 0 }}>
                  {tokens.charAt(0) && <span className="dropcap">{tokens.charAt(0)}</span>}
                  <Bionic>{tokens.slice(1) || ' '}</Bionic>
                  {streaming && <span className="cursor" />}
                </p>
              </motion.div>
            )}

            {!streaming && !tokens && (
              <div style={{ color: 'var(--text-3)' }}>
                <div className="caps" style={{ marginBottom: 8 }}>AURA · STANDING BY</div>
                <p className="prose" style={{ margin: 0, opacity: 0.5 }}>
                  Send a directive below. Tool calls will appear in the right gutter as numbered marginalia.
                </p>
              </div>
            )}
          </div>

          {/* Composer */}
          <div style={{ borderTop: 'var(--rule-thick)', padding: '12px 20px', background: 'var(--paper)' }}>
            <div className="row" style={{ gap: 10 }}>
              <span className="caps">COMPOSE</span>
              <input
                className="input"
                style={{ flex: 1 }}
                placeholder="Type a directive…"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                disabled={streaming}
              />
              <button className="btn primary" onClick={handleSend} disabled={streaming || !prompt.trim()}>
                {streaming ? <span className="spinner" /> : <Send size={12} />}
                {streaming ? 'STREAMING' : 'SEND ⏎'}
              </button>
            </div>
            <div className="row" style={{ marginTop: 8, gap: 6 }}>
              <span className="tag"><Cpu size={9} /> SONNET</span>
              <span className="tag"><Wrench size={9} /> 14 TOOLS</span>
              <span className="tag">MEMORY · ON</span>
              <span className="tag verified">VERIFY BEFORE COMMIT</span>
            </div>
          </div>
        </main>

        {/* RIGHT — marginalia */}
        <aside style={{
          width: 280, borderLeft: 'var(--rule-thick)', background: 'var(--paper)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div className="row" style={{
            justifyContent: 'space-between', padding: '10px 14px',
            borderBottom: 'var(--rule-thick)', background: 'var(--card-alt)',
          }}>
            <span className="caps">MARGINALIA</span>
            <span className="caps" style={{ color: 'var(--text-3)' }}>{tools.length} NOTES</span>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
            <div className="display" style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 12, lineHeight: 1.2 }}>
              Tools that fed the answer.
            </div>
            {tools.length === 0 && (
              <div className="mono" style={{ fontSize: 10, color: 'var(--text-4)' }}>
                Tool calls will appear here during streaming.
              </div>
            )}
            {tools.map(t => (
              <div key={t.n} style={{
                display: 'grid', gridTemplateColumns: '20px 1fr',
                gap: 8, paddingBottom: 10, marginBottom: 10,
                borderBottom: '1px dashed var(--rule)',
              }}>
                <div className="display" style={{ fontSize: 16, color: 'var(--oxblood)', lineHeight: 1 }}>
                  {t.n}.
                </div>
                <div>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="mono" style={{ fontSize: 11, fontWeight: 700 }}>{t.name}()</span>
                    {t.ok === true && <span className="tag verified" style={{ padding: '0 4px' }}>✓</span>}
                    {t.ok === null && <span className="dot live" />}
                    {t.ok === false && <span className="dot error" />}
                  </div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 3, wordBreak: 'break-word' }}>
                    {t.args}
                  </div>
                  {t.ms && (
                    <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 4 }}>
                      {t.ms < 1000 ? `${t.ms}ms` : `${(t.ms / 1000).toFixed(2)}s`}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div style={{ borderTop: 'var(--rule-thick)', padding: 12, background: 'var(--card)' }}>
            <div className="caps" style={{ marginBottom: 4 }}>TALLY</div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--text-2)' }}>
              {tools.length} CALLS · {tools.filter(t => t.ok === false).length} ERRORS
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
