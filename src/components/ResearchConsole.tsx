import { useState, useEffect } from 'react';
import { Plus, Search, FileText, Tag, Trash2, Activity } from 'lucide-react';
import { ResearchSnippet } from '../shared/types';

const getAura = () => (window as any).aura;

const parseTags = (tags: string | null | undefined): string[] => {
  if (!tags) return [];
  try {
    const p = JSON.parse(tags);
    return Array.isArray(p) ? p : [];
  } catch { return []; }
};

export default function ResearchConsole() {
  const [snippets, setSnippets]     = useState<ResearchSnippet[]>([]);
  const [activeId, setActiveId]     = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);
  const [q, setQ]                   = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [newTitle,   setNewTitle]   = useState('');
  const [newContent, setNewContent] = useState('');
  const [newTags,    setNewTags]    = useState('');

  const loadSnippets = async () => {
    try {
      const data = await getAura().getSnippets();
      setSnippets(Array.isArray(data) ? data : []);
    } catch (err) { console.error('[ResearchConsole]', err); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadSnippets(); }, []);

  const handleCreate = async () => {
    if (!newTitle) return;
    try {
      await getAura().createSnippet({
        title: newTitle,
        content: newContent,
        tags: newTags.split(',').map(t => t.trim()).filter(Boolean),
      });
      setNewTitle(''); setNewContent(''); setNewTags('');
      setIsCreating(false);
      loadSnippets();
    } catch (err) { console.error(err); }
  };

  const handleVerify = async (state: ResearchSnippet['verification_state']) => {
    if (!active) return;
    try {
      await getAura().updateSnippet(active.id, { verification_state: state });
      setSnippets(prev => prev.map(s => s.id === active.id ? { ...s, verification_state: state } : s));
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await getAura().deleteSnippet(id);
      if (activeId === id) setActiveId(null);
      loadSnippets();
    } catch (err) { console.error(err); }
  };

  const filtered = snippets.filter(s =>
    !q || (s.title + s.content + (s.tags ?? '')).toLowerCase().includes(q.toLowerCase())
  );

  const active = snippets.find(s => s.id === activeId) ?? (filtered[0] ?? null);

  const verifiedCount = snippets.filter(s =>
    s.verification_state === 'accepted' || s.verification_state === 'source_checked'
  ).length;

  return (
    <div className="page">
      <div className="page-hd">
        <div className="page-hd-title">
          <b>Research Console</b>
          <span>{snippets.length} snippets · {verifiedCount} verified</span>
        </div>
        <button className="btn primary" onClick={() => setIsCreating(true)}>
          <Plus size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          NEW SNIPPET
        </button>
      </div>

      <div className="page-body" style={{ padding: 0 }}>
        {isCreating ? (
          /* ── Create form ─────────────────────────────────────────── */
          <div style={{ padding: 'var(--pad-3)', maxWidth: 640 }}>
            <div style={{ marginBottom: 'var(--pad-2)', fontSize: 'var(--fs-sm)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              New Snippet
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)' }}>
              <div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Title</div>
                <input
                  autoFocus
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  placeholder="snippet title…"
                  style={{ width: '100%', background: 'var(--panel)', border: '1px solid var(--border-2)', padding: '6px 10px', color: 'var(--text)', fontSize: 'var(--fs-md)' }}
                />
              </div>
              <div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Tags (comma-separated)</div>
                <input
                  value={newTags}
                  onChange={e => setNewTags(e.target.value)}
                  placeholder="design-system, components…"
                  style={{ width: '100%', background: 'var(--panel)', border: '1px solid var(--border-2)', padding: '6px 10px', color: 'var(--accent)', fontSize: 'var(--fs-md)' }}
                />
              </div>
              <div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Body</div>
                <textarea
                  value={newContent}
                  onChange={e => setNewContent(e.target.value)}
                  placeholder="snippet content…"
                  rows={8}
                  style={{ width: '100%', background: 'var(--panel)', border: '1px solid var(--border-2)', padding: '8px 10px', color: 'var(--text-2)', fontSize: 'var(--fs-md)', resize: 'vertical', lineHeight: 1.6 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn primary" onClick={handleCreate}>save</button>
                <button className="btn" onClick={() => setIsCreating(false)}>cancel</button>
              </div>
            </div>
          </div>
        ) : (
          /* ── List + detail ────────────────────────────────────────── */
          <div className="research-grid" style={{ padding: 'var(--pad-1)' }}>
            <div className="research-list">
              <div className="research-search">
                <Search size={12} />
                <input
                  placeholder="search snippets, tags, body…"
                  value={q}
                  onChange={e => setQ(e.target.value)}
                />
              </div>
              <div className="research-snippets">
                {loading && (
                  <div style={{ padding: 16, color: 'var(--text-4)', textAlign: 'center' }}>
                    <Activity size={14} style={{ animation: 'spin 700ms linear infinite' }} />
                  </div>
                )}
                {!loading && filtered.length === 0 && (
                  <div style={{ padding: 16, color: 'var(--text-4)', fontSize: 'var(--fs-sm)', textAlign: 'center' }}>
                    — no snippets —
                  </div>
                )}
                {filtered.map(s => {
                  const tags = parseTags(s.tags);
                  const isVerified = s.verification_state === 'accepted' || s.verification_state === 'source_checked';
                  return (
                    <div
                      key={s.id}
                      className={`snippet${activeId === s.id || (!activeId && s === active) ? ' active' : ''}`}
                      onClick={() => setActiveId(s.id)}
                    >
                      <div className="snippet-title">{s.title}</div>
                      <div className="snippet-meta">
                        {tags.slice(0, 1).map(t => (
                          <span key={t} className="tag">
                            <Tag size={8} style={{ verticalAlign: 'middle', marginRight: 3 }} />{t}
                          </span>
                        ))}
                        <span className={`tag${isVerified ? ' verified' : ' unverified'}`}>
                          {isVerified ? '✓ verified' : '? unverified'}
                        </span>
                        <button
                          onClick={e => handleDelete(s.id, e)}
                          style={{ marginLeft: 'auto', color: 'var(--text-4)' }}
                          title="Delete"
                        >
                          <Trash2 size={9} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {active ? (
              <div className="research-detail">
                <h2>{active.title}</h2>
                <div className="rd-source">
                  <FileText size={11} />
                  <span>{(active as any).source ?? 'internal'}</span>
                  <span style={{ marginLeft: 'auto' }}>
                    <span className={`tag${(active.verification_state === 'accepted' || active.verification_state === 'source_checked') ? ' verified' : ' unverified'}`}>
                      {(active.verification_state === 'accepted' || active.verification_state === 'source_checked') ? '✓ verified' : '? unverified'}
                    </span>
                  </span>
                </div>
                {active.content.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}
                <div className="rd-actions">
                  <button className="btn">edit</button>
                  <button className="btn" onClick={() => handleVerify('source_checked')}>retag</button>
                  {active.verification_state !== 'accepted' && (
                    <button className="btn primary" onClick={() => handleVerify('accepted')}>mark verified</button>
                  )}
                  <button className="btn danger" style={{ marginLeft: 'auto' }}>archive</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', placeItems: 'center', color: 'var(--text-4)', background: 'var(--panel)', border: '1px solid var(--border)' }}>
                <div style={{ textAlign: 'center' }}>
                  <FileText size={48} style={{ margin: '0 auto 12px', color: 'var(--border-2)' }} />
                  <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-3)' }}>Select a snippet</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
