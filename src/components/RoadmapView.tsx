// src/components/RoadmapView.tsx
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Plus } from 'lucide-react';
import type { RoadmapItem, RoadmapStatus } from '../shared/types';
import { Spinner, SectionNum } from './ui/atoms';

const getAura = () => (window as any).aura;

const LANES: { key: RoadmapStatus; title: string; bg: string }[] = [
  { key: 'backlog',     title: 'Backlog',     bg: 'var(--card)' },
  { key: 'todo',        title: 'To do',       bg: 'var(--card)' },
  { key: 'in_progress', title: 'In progress', bg: 'var(--chartreuse)' },
  { key: 'done',        title: 'Done',        bg: 'var(--card-alt)' },
];

export default function RoadmapView() {
  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try { setItems(await getAura().listRoadmapItems()); }
    catch (err) { console.error('[RoadmapView]', err); }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    try {
      await getAura().createRoadmapItem({ title: 'New item', status: 'backlog', priority: 0, roi_score: 0, lane: 'ux', tags: '[]' });
      await fetchData();
    } catch (err) { console.error('[RoadmapView]', err); }
  };

  const handleDrop = async (status: RoadmapStatus) => {
    if (!draggingId) return;
    try { await getAura().updateRoadmapItem(draggingId, { status }); await fetchData(); }
    catch (err) { console.error('[RoadmapView]', err); }
    finally { setDraggingId(null); }
  };

  return (
    <div className="page">
      <div className="page-hd">
        <div className="page-hd-title">
          <SectionNum n="02" />
          <b>Specimen Sheet</b>
          <span>{items.length} cards · 4 lanes</span>
        </div>
        <div className="page-hd-actions">
          <button className="btn primary" onClick={handleCreate}><Plus size={12} /> NEW</button>
        </div>
      </div>
      <div className="page-body" style={{ padding: 20 }}>
        {loading ? <Spinner /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, height: '100%' }}>
            {LANES.map(lane => {
              const laneItems = items.filter(i => i.status === lane.key);
              return (
                <div key={lane.key} onDragOver={(e) => e.preventDefault()} onDrop={() => handleDrop(lane.key)} style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <div className="row" style={{ justifyContent: 'space-between', borderBottom: '2px solid var(--rule)', padding: '8px 4px' }}>
                    <span className="display" style={{ fontSize: 22 }}>{lane.title}</span>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>{laneItems.length} ITEMS</span>
                  </div>
                  <div style={{ marginTop: 14, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 12 }}>
                    {laneItems.map(it => {
                      const tags: string[] = JSON.parse(it.tags || '[]');
                      return (
                        <motion.div key={it.id} draggable onDragStart={() => setDraggingId(it.id)} onDragEnd={() => setDraggingId(null)}
                          whileHover={{ x: -1, y: -1 }}
                          style={{ border: '2px solid var(--rule)', background: lane.bg, padding: 12, boxShadow: '4px 4px 0 var(--rule)', cursor: 'grab',
                            color: lane.key === 'in_progress' ? 'var(--ink)' : 'var(--text)' }}>
                          <div className="row" style={{ justifyContent: 'space-between' }}>
                            <span className="mono" style={{ fontSize: 9, fontWeight: 700 }}>· {lane.key.toUpperCase()} ·</span>
                            <span className="mono" style={{ fontSize: 9, opacity: 0.7 }}>p{it.priority}</span>
                          </div>
                          <div className="display" style={{ fontSize: 17, lineHeight: 1.15, marginTop: 6 }}>{it.title}</div>
                          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12, paddingTop: 8, borderTop: '1px dashed var(--rule)' }}>
                            <div className="row" style={{ gap: 4, flexWrap: 'wrap', maxWidth: '70%' }}>
                              {tags.map(t => <span key={t} className="tag" style={{ fontSize: 8 }}>{t}</span>)}
                            </div>
                            <div className="row" style={{ gap: 4, alignItems: 'center' }}>
                              {it.verification_state === 'accepted' && <span className="tag verified" style={{ padding: '0 3px' }}>✓</span>}
                              {it.verification_state === 'source_checked' && <span className="dot live" />}
                              <span className="display" style={{ fontSize: 24, lineHeight: 1, color: it.roi_score >= 7 ? 'var(--oxblood)' : 'inherit' }}>
                                {it.roi_score.toFixed(1)}
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                    {lane.key === 'backlog' && (
                      <div style={{ border: '2px dashed var(--rule)', padding: 14, textAlign: 'center' }} className="caps">+ DROP CARD HERE</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
