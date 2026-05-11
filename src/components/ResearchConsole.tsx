// src/components/ResearchConsole.tsx
import { useEffect, useState } from 'react';
import { Plus, Search, Trash2, Edit3, Archive } from 'lucide-react';
import type { ResearchSnippet } from '../shared/types';
import { Spinner, VerificationBadge, SectionNum } from './ui/atoms';

const getAura = () => (window as any).aura;

export default function ResearchConsole() {
  const [snippets, setSnippets] = useState<ResearchSnippet[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try { const r = await getAura().getSnippets(); setSnippets(r); setActiveId(r[0]?.id || null); }
    catch (err) { console.error('[ResearchConsole]', err); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    try { await getAura().createSnippet({ title: 'New snippet', content: '', tags: '[]', verification_state: 'unverified' }); await fetchData(); }
    catch (err) { console.error('[ResearchConsole]', err); }
  };
  const handleDelete = async (id: string) => {
    try { await getAura().deleteSnippet(id); await fetchData(); }
    catch (err) { console.error('[ResearchConsole]', err); }
  };

  const filtered = snippets.filter(s => !q || s.title.toLowerCase().includes(q.toLowerCase()));
  const active = snippets.find(s => s.id === activeId);

  return (
    <div className="page">
      <div className="page-hd">
        <div className="page-hd-title">
          <SectionNum n="03" />
          <b>The Commonplace Book</b>
          <span>{snippets.length} entries</span>
        </div>
        <div className="page-hd-actions">
          <span className="search"><Search size={11} /><input placeholder="search snippets…" value={q} onChange={(e) => setQ(e.target.value)} /></span>
          <button className="btn primary" onClick={handleCreate}><Plus size={12} /> NEW</button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <aside style={{ width: 320, borderRight: 'var(--rule-thick)', background: 'var(--paper)', overflow: 'auto' }}>
          {loading && <div style={{ padding: 16 }}><Spinner /></div>}
          {filtered.map((s) => {
            const tags: string[] = JSON.parse(s.tags || '[]');
            const isActive = s.id === activeId;
            return (
              <button key={s.id} onClick={() => setActiveId(s.id)} style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '12px 14px', borderBottom: '1px solid var(--rule)',
                background: isActive ? 'var(--card)' : 'transparent',
                borderLeft: isActive ? '6px solid var(--oxblood)' : '6px solid transparent',
                cursor: 'pointer', color: 'var(--text)', borderTop: 0, borderRight: 0,
              }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)' }}>{s.id.toUpperCase().slice(0, 12)}</span>
                  <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)' }}>{new Date(s.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                </div>
                <div className="display" style={{ fontSize: 16, lineHeight: 1.15, marginTop: 4 }}>{s.title}</div>
                <div className="row" style={{ marginTop: 8, justifyContent: 'space-between' }}>
                  <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                    {tags.slice(0, 2).map(t => <span key={t} className="tag" style={{ fontSize: 8 }}>{t}</span>)}
                  </div>
                  <VerificationBadge state={s.verification_state} />
                </div>
              </button>
            );
          })}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: 16 }}>
              <div className="empty" style={{ fontSize: 10 }}>NO ENTRIES</div>
            </div>
          )}
        </aside>

        <main style={{ flex: 1, overflow: 'auto', padding: '24px 36px', background: 'var(--card)' }}>
          {active ? (
            <>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="caps" style={{ color: 'var(--text-2)' }}>{active.id.toUpperCase().slice(0, 12)} · ENTRY</span>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn sm"><Edit3 size={10} /> EDIT</button>
                  <button className="btn sm"><Archive size={10} /> ARCHIVE</button>
                  <button className="btn sm danger" onClick={() => handleDelete(active.id)}><Trash2 size={10} /> DELETE</button>
                </div>
              </div>
              <div className="display" style={{ fontSize: 56, lineHeight: 0.95, letterSpacing: '-0.03em', marginTop: 10 }}>{active.title}</div>
              <div className="row" style={{ marginTop: 12, gap: 8, borderBottom: '2px solid var(--rule)', paddingBottom: 12 }}>
                {(JSON.parse(active.tags || '[]') as string[]).map(t => <span key={t} className="tag">{t}</span>)}
                <span style={{ flex: 1 }} />
                <VerificationBadge state={active.verification_state} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 28, marginTop: 22 }}>
                <article>
                  <p className="prose" style={{ margin: 0 }}>
                    <span className="dropcap">{active.content.charAt(0) || 'A'}</span>
                    {active.content.slice(1) || 'No content yet.'}
                  </p>
                </article>
                <aside>
                  <div className="caps" style={{ marginBottom: 8 }}>FOOTNOTES</div>
                  <ol className="mono" style={{ margin: 0, paddingLeft: 18, fontSize: 11, lineHeight: 1.6 }}>
                    <li>API status page</li>
                    <li>Internal RFC: orchestrator/queueing</li>
                    <li>"Exponential backoff and jitter," AWS</li>
                  </ol>
                  <div className="caps" style={{ marginTop: 22, marginBottom: 8 }}>VERIFICATIONS</div>
                  <div style={{ fontSize: 11 }}>
                    <div className="row" style={{ justifyContent: 'space-between', padding: '3px 0' }}><span>Source ↗</span><VerificationBadge state={active.verification_state} /></div>
                    <div className="row" style={{ justifyContent: 'space-between', padding: '3px 0' }}><span>Editor pass</span><span className="tag unverified" style={{ padding: '0 3px' }}>·</span></div>
                    <div className="row" style={{ justifyContent: 'space-between', padding: '3px 0' }}><span>Cited in card</span><span className="mono">—</span></div>
                  </div>
                </aside>
              </div>
            </>
          ) : (!loading && <div className="empty">SELECT AN ENTRY TO READ</div>)}
          {loading && <Spinner />}
        </main>
      </div>
    </div>
  );
}
