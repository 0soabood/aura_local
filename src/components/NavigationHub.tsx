// src/components/NavigationHub.tsx
// Brutalist hub: heavy slabs, oversized JetBrains Mono headlines, gaffer-tape
// stamp, oxblood/chartreuse accents. Each tile navigates to a department.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Terminal as TerminalIcon, Map, BookMarked, BarChart3, ScrollText, Archive, Command } from 'lucide-react';
import type { TelemetryMetricsV2, Session } from '../shared/types';
import { Mark } from './ui/atoms';

const getAura = () => (window as any).aura;

// Navigation mapping from department keys to routes
const routeMap: Record<string, string> = {
  terminal: '/terminal',
  roadmap: '/roadmap',
  research: '/research',
  roi: '/dash',
  logs: '/logs',
  archive: '/logs', // Archive maps to logs for now
  chat: '/chat',
  hub: '/hub',
};

interface Dept {
  n: string; key: string; title: string; sub: string; meta: string;
  Icon: any; accent: 'chart' | 'oxblood' | 'ink' | 'paper'; lead?: boolean;
}

const ACCENTS = {
  chart:   { bg: 'var(--chartreuse)', fg: 'var(--ink)' },
  oxblood: { bg: 'var(--oxblood)',    fg: 'var(--bone)' },
  ink:     { bg: 'var(--ink)',        fg: 'var(--bone)' },
  paper:   { bg: 'var(--card)',       fg: 'var(--text)' },
};

export default function NavigationHub() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<TelemetryMetricsV2 | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [roadmapCount, setRoadmapCount] = useState(0);
  const [researchCount, setResearchCount] = useState(0);
  const [logsCount, setLogsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const aura = getAura();
      
      const getStats = async () => {
        try { return await aura?.getStatsV2?.() ?? null; } catch { return null; }
      };
      const getSessions = async () => {
        try { return await aura?.listSessionsV2?.() ?? []; } catch { return []; }
      };
      const getRoadmapCount = async () => {
        try { const items = await aura?.listRoadmapItems?.() ?? []; return Array.isArray(items) ? items.length : 0; } catch { return 0; }
      };
      const getSnippetCount = async () => {
        try { const items = await aura?.getSnippets?.() ?? []; return Array.isArray(items) ? items.length : 0; } catch { return 0; }
      };
      const getLogCount = async () => {
        try { const items = await aura?.listLogs?.() ?? []; return Array.isArray(items) ? items.length : 0; } catch { return 0; }
      };

      const [s, ss, rCount, resCount, lCount] = await Promise.all([
        getStats(), getSessions(), getRoadmapCount(), getSnippetCount(), getLogCount()
      ]);

      setStats(s);
      setSessions(Array.isArray(ss) ? ss : []);
      setRoadmapCount(typeof rCount === 'number' ? rCount : 0);
      setResearchCount(typeof resCount === 'number' ? resCount : 0);
      setLogsCount(typeof lCount === 'number' ? lCount : 0);
    } catch (err) {
      console.error('[NavigationHub]', err);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const validSessions = Array.isArray(sessions) ? sessions.filter(s => s && typeof s === 'object') : [];
  const liveCount = validSessions.filter(s => s.state === 'running').length;
  const doneCount = validSessions.filter(s => s.state === 'done').length;
  const errorCount = validSessions.filter(s => s.state === 'error').length;

  // Session resumption badges
  const resumedCount = validSessions.filter(s => s.state === 'done' || s.state === 'error').length;

  const safeStats = stats && typeof stats === 'object' ? stats : null;
  const depts: Dept[] = [
    { n: '01', key: 'terminal', title: 'TERMINAL', sub: 'orchestration / streams',  meta: `${liveCount} LIVE · ${doneCount} DONE`, Icon: TerminalIcon, accent: 'chart', lead: true },
    /* DISABLED FOR MVP
    { n: '02', key: 'roadmap',  title: 'ROADMAP',  sub: 'lanes / priority / roi',   meta: `${roadmapCount} CARDS`, Icon: Map,        accent: 'ink' },
    { n: '03', key: 'research', title: 'RESEARCH', sub: 'snippets / verifications', meta: `${researchCount} ENTRIES`, Icon: BookMarked, accent: 'paper' },
    { n: '04', key: 'roi',      title: 'ROI',      sub: 'latency / cost / routes',  meta: safeStats ? `$${Number(safeStats.est_token_cost_usd || 0).toFixed(2)}` : '—', Icon: BarChart3, accent: 'oxblood' },
    { n: '05', key: 'logs',     title: 'LOGS',     sub: 'audit / ledger',           meta: `${Number(logsCount || 0).toLocaleString()}`, Icon: ScrollText, accent: 'paper' },
    { n: '06', key: 'archive',  title: 'ARCHIVE',  sub: 'sessions / exports',       meta: `${validSessions.filter(s => s.state === 'archived').length}`, Icon: Archive, accent: 'ink' },
    */
  ];

  return (
    <div className="page">
      <div className="page-body no-pad" style={{ padding: 0, position: 'relative', overflowX: 'hidden' }}>
        {/* Gaffer-tape stamp */}
        <div style={{
          position: 'absolute', top: 16, right: -44, transform: 'rotate(8deg)',
          background: 'var(--marigold)', border: '2px solid var(--rule)',
          padding: '4px 56px', fontFamily: 'var(--font-mono)', fontSize: 10,
          fontWeight: 700, letterSpacing: '0.18em', boxShadow: 'var(--shadow-hard)', zIndex: 5,
        }}>v1.0 · LOCAL ONLY</div>

        {/* Masthead */}
        <div style={{ padding: '32px 36px 20px', borderBottom: 'var(--rule-heavy)' }}>
          <div className="row" style={{ alignItems: 'flex-start', gap: 24 }}>
            <div style={{
              width: 132, height: 132, background: 'var(--ink)', color: 'var(--bone)',
              border: '4px solid var(--rule)', boxShadow: '8px 8px 0 var(--rule)',
              display: 'grid', placeItems: 'center',
              fontFamily: 'var(--font-display)', fontStyle: 'italic',
              fontSize: 96, lineHeight: 1, letterSpacing: '-0.08em', flexShrink: 0,
            }}>Æ</div>

            <div style={{ flex: 1 }}>
              <div className="row" style={{ alignItems: 'center', gap: 8 }}>
                <span className="tag filled">HUB</span>
                <span className="caps" style={{ color: 'var(--text-2)' }}>
                  {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '.')} · LOCAL
                </span>
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 92, fontWeight: 700,
                lineHeight: 0.85, letterSpacing: '-0.04em', textTransform: 'uppercase', marginTop: 6,
              }}>
                AURA<span style={{ color: 'var(--oxblood)' }}>/</span>CODE
              </div>
              <div className="caps" style={{ marginTop: 10, fontSize: 12, color: 'var(--text-2)' }}>
                AN AGENT FOR LONG THINKING.&nbsp;&nbsp;NO CLOUD.&nbsp;&nbsp;NO TELEMETRY.&nbsp;&nbsp;NO NONSENSE.
              </div>
            </div>
          </div>
        </div>

        {/* Status bar — black brick */}
        <div className="row" style={{
          background: 'var(--ink)', color: 'var(--bone)',
          borderBottom: 'var(--rule-heavy)',
          padding: '10px 36px', gap: 32,
          fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
        }}>
          <span className="row" style={{ gap: 8 }}>
            <span className="dot live" /> {liveCount} ROUTES LIVE
          </span>
          <span>↳ LATENCY {stats ? (stats.avg_latency_ms / 1000).toFixed(2) + 's' : '—'}</span>
          <span>↳ SUCCESS {stats ? (stats.success_rate * 100).toFixed(1) + '%' : '—'}</span>
          <span>↳ BUDGET ${stats ? stats.est_token_cost_usd.toFixed(2) : '—'} / $200.00</span>
          <span style={{ flex: 1 }} />
          <span><Command size={11} style={{ verticalAlign: -1 }} /> K → SUMMON</span>
        </div>

        {/* Department slabs */}
        <div style={{
          padding: 28,
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gridAutoRows: '180px',
          gap: 18,
        }}>
          {depts.map((d, i) => {
            const a = ACCENTS[d.accent];
            const lead = d.lead;
            return (
              <motion.button
                key={d.key}
                onClick={() => navigate(routeMap[d.key] || '/hub')}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.25 }}
                whileHover={{ x: -2, y: -2 }}
                whileTap={{ x: 2, y: 2 }}
                style={{
                  gridColumn: lead ? 'span 2' : 'span 1',
                  gridRow:    lead ? 'span 2' : 'span 1',
                  background: a.bg, color: a.fg,
                  border: '4px solid var(--rule)',
                  boxShadow: lead ? '10px 10px 0 var(--rule)' : '8px 8px 0 var(--rule)',
                  padding: lead ? 24 : 18,
                  display: 'flex', flexDirection: 'column',
                  position: 'relative', overflow: 'hidden',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                {/* Big background numeral */}
                <span style={{
                  position: 'absolute', right: lead ? -20 : -10, bottom: lead ? -50 : -30,
                  fontFamily: 'var(--font-mono)', fontWeight: 700,
                  fontSize: lead ? 320 : 180, lineHeight: 0.8, letterSpacing: '-0.05em',
                  color: a.fg, opacity: 0.08, pointerEvents: 'none',
                }}>{d.n}</span>

                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{
                    background: a.fg, color: a.bg,
                    padding: '3px 8px', border: `1.5px solid ${a.fg}`,
                    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
                  }}>§ {d.n}{lead ? ' / LEAD' : ''}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em' }}>
                    {d.meta}
                  </span>
                </div>

                <div style={{ flex: 1 }} />

                <d.Icon size={lead ? 28 : 20} strokeWidth={2.5} style={{ marginBottom: 8 }} />

                <div style={{
                  fontFamily: 'var(--font-mono)', fontWeight: 700,
                  fontSize: lead ? 96 : 38, lineHeight: 0.95, letterSpacing: '-0.03em',
                }}>{d.title}</div>

                <div className="caps" style={{ marginTop: 6, fontSize: 11, opacity: 0.85 }}>
                  {d.sub}
                </div>

                {lead && validSessions.length > 0 && (
                  <div className="row" style={{ marginTop: 16, gap: 10 }}>
                    <span style={{
                      background: 'var(--ink)', color: 'var(--bone)',
                      border: '2px solid var(--rule)',
                      padding: '8px 14px',
                      fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em',
                    }}>RESUME ⏎</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700 }}>
                      ↳ {validSessions[0]?.name || '—'} · {Number(validSessions[0]?.token_count || 0).toLocaleString()} TOK
                    </span>
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Recent strip */}
        <div className="row" style={{
          borderTop: 'var(--rule-heavy)', background: 'var(--card-alt)',
          padding: '14px 36px', gap: 28,
          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.16em',
        }}>
          <span>RECENT:</span>
          {validSessions.slice(0, 4).map((s, i) => {
            const isResumable = s && (s.state === 'done' || s.state === 'error');
            const sessionName = s?.name ? String(s.name).toUpperCase().replace(/\s+/g, '-') : 'UNTITLED';
            const sessionTime = s?.created_at ? (() => { try { return new Date(s.created_at).toTimeString().slice(0, 5); } catch { return '--:--'; } })() : '--:--';
            return (
              <span key={s?.id || i} style={{ paddingRight: 28, borderRight: i < 3 ? '2px solid var(--rule)' : 'none' }}>
                {isResumable && <span title="Resumable session">↻ </span>}
                {sessionName} · {sessionTime}
              </span>
            );
          })}
          {!loading && validSessions.length === 0 && <span style={{ opacity: 0.5 }}>NO SESSIONS YET</span>}
          <span style={{ flex: 1 }} />
          <span style={{ opacity: 0.6 }}>SET IN JETBRAINS MONO 700</span>
        </div>
      </div>
    </div>
  );
}
