// src/components/SystemLogs.tsx
import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { SystemLog, LogLevel } from '../shared/types';
import { Spinner, SectionNum } from './ui/atoms';

const getAura = () => (window as any).aura;

const FILTERS: { k: 'all' | LogLevel; label: string }[] = [
  { k: 'all',   label: 'ALL' },
  { k: 'info',  label: 'INFO' },
  { k: 'warn',  label: 'WARN' },
  { k: 'error', label: 'ERROR' },
  { k: 'audit', label: 'AUDIT' },
];

const lvlBg = (l: LogLevel) =>
  l === 'error' ? 'var(--oxblood)' : l === 'warn' ? 'var(--marigold)' : l === 'audit' ? 'var(--ultramarine)' : 'var(--text-3)';
const lvlFg = (l: LogLevel) => l === 'warn' ? 'var(--ink)' : 'var(--bone)';

export default function SystemLogs() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [filter, setFilter] = useState<'all' | LogLevel>('all');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try { setLogs(await getAura().listLogs(200)); }
    catch (err) { console.error('[SystemLogs]', err); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, []);

  const handleManual = async () => {
    try { await getAura().createLog('audit', 'Manual', 'Manual entry from operator'); await fetchData(); }
    catch (err) { console.error('[SystemLogs]', err); }
  };

  const visible = logs.filter(l => (filter === 'all' || l.level === filter) && (!q || l.message.toLowerCase().includes(q.toLowerCase())));
  const counts = {
    all: logs.length,
    info: logs.filter(l => l.level === 'info').length,
    warn: logs.filter(l => l.level === 'warn').length,
    error: logs.filter(l => l.level === 'error').length,
    audit: logs.filter(l => l.level === 'audit').length,
  };

  return (
    <div className="page">
      <div className="page-hd">
        <div className="page-hd-title">
          <SectionNum n="05" />
          <b>The Ledger</b>
          <span>showing {visible.length} of {logs.length} entries</span>
        </div>
        <div className="page-hd-actions">
          <span className="search"><Search size={11} /><input placeholder="search ledger…" value={q} onChange={(e) => setQ(e.target.value)} /></span>
          <button className="btn primary" onClick={handleManual}><Plus size={12} /> MANUAL</button>
        </div>
      </div>

      <div className="row" style={{ borderBottom: 'var(--rule-thick)', padding: '12px 20px', gap: 10, background: 'var(--card-alt)', flexWrap: 'wrap' }}>
        <span className="caps">FILTERS:</span>
        {FILTERS.map(f => (
          <button key={f.k} onClick={() => setFilter(f.k)} style={{
            border: '2px solid var(--rule)', background: filter === f.k ? 'var(--bone)' : 'var(--card)',
            color: filter === f.k ? 'var(--ink)' : 'var(--text)', padding: '4px 10px',
            fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer',
          }}>{f.label} <span style={{ opacity: 0.6, marginLeft: 4 }}>{counts[f.k]}</span></button>
        ))}
      </div>

      <div className="row" style={{ padding: '8px 20px', borderBottom: 'var(--rule-thick)', background: 'var(--paper)',
        fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
        <div style={{ width: 90 }}>Time</div>
        <div style={{ width: 80 }}>Level</div>
        <div style={{ width: 130 }}>Module</div>
        <div style={{ flex: 1 }}>Message</div>
        <div style={{ width: 70, textAlign: 'right' }}>№</div>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {loading ? <div style={{ padding: 16 }}><Spinner /></div> : visible.map((e, i) => (
          <div key={e.id} className="row" style={{
            padding: '8px 20px', borderBottom: '1px solid var(--rule)',
            fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.4,
            background: i % 2 === 1 ? 'var(--paper)' : 'transparent', alignItems: 'flex-start',
          }}>
            <div style={{ width: 90, color: 'var(--text-2)' }}>{new Date(e.created_at).toTimeString().slice(0, 8)}</div>
            <div style={{ width: 80 }}>
              <span style={{ display: 'inline-block', padding: '1px 6px', background: lvlBg(e.level), color: lvlFg(e.level),
                fontWeight: 700, fontSize: 9, letterSpacing: '0.14em', border: '1.5px solid var(--rule)' }}>{e.level.toUpperCase()}</span>
            </div>
            <div style={{ width: 130, fontWeight: 700 }}>{e.module}</div>
            <div style={{ flex: 1 }}>{e.message}</div>
            <div style={{ width: 70, textAlign: 'right', color: 'var(--text-3)' }}>№ {String(logs.length - i).padStart(4, '0')}</div>
          </div>
        ))}
        {!loading && visible.length === 0 && <div style={{ padding: 20 }}><div className="empty">NO ENTRIES MATCH</div></div>}
      </div>

      <div className="row" style={{ borderTop: 'var(--rule-heavy)', padding: '10px 20px', background: 'var(--paper)',
        fontFamily: 'var(--font-mono)', fontSize: 10 }}>
        <span>↳ TAIL · AUTO-SCROLL <span className="dot live" style={{ marginLeft: 4 }} /></span>
        <span style={{ flex: 1 }} />
        <span style={{ color: 'var(--text-2)' }}>EXPORT&nbsp;.NDJSON&nbsp;·&nbsp;EXPORT&nbsp;.CSV</span>
      </div>
    </div>
  );
}
