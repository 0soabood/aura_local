import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { RoadmapItem, WorkflowStatus } from '../shared/types';

const aura = (window as any).aura;

type ColumnDef = { id: WorkflowStatus; label: string };

const COLUMNS: ColumnDef[] = [
  { id: 'backlog', label: 'BACKLOG' },
  { id: 'todo', label: 'TODO_QUEUE' },
  { id: 'in_progress', label: 'IN_EXECUTION' },
  { id: 'done', label: 'CONCLUDED' },
  { id: 'archived', label: 'ARCHIVED' },
];

const VERIFIED = new Set(['accepted', 'source_checked']);

export default function RoadmapView() {
  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newROI, setNewROI] = useState(6);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<WorkflowStatus | null>(null);

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const data = await aura.listRoadmapItems();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title) return;
    try {
      await aura.createRoadmapItem({
        title,
        roi_score: newROI,
        lane: 'CORE_STRAT',
        priority: Math.max(1, Math.min(5, Math.floor(newROI / 2))),
        status: 'backlog',
      });
      setNewTitle('');
      setNewROI(6);
      setCreating(false);
      await fetchItems();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateStatus = async (id: string, status: WorkflowStatus) => {
    try {
      await aura.updateRoadmapItem(id, { status });
      await fetchItems();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await aura.deleteRoadmapItem(id);
      await fetchItems();
    } catch (err) {
      console.error(err);
    }
  };

  const grouped = useMemo(() => {
    const buckets: Record<WorkflowStatus, RoadmapItem[]> = {
      backlog: [],
      todo: [],
      in_progress: [],
      done: [],
      archived: [],
    };
    for (const item of items) {
      buckets[item.status].push(item);
    }
    for (const key of Object.keys(buckets) as WorkflowStatus[]) {
      buckets[key].sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
    }
    return buckets;
  }, [items]);

  const onDropColumn = async (nextStatus: WorkflowStatus) => {
    if (!draggingId) return;
    const item = items.find((x) => x.id === draggingId);
    setDropTarget(null);
    setDraggingId(null);
    if (!item || item.status === nextStatus) return;
    await handleUpdateStatus(item.id, nextStatus);
  };

  return (
    <div className="page">
      <div className="page-hd">
        <div className="page-hd-title">
          <b>Roadmap Matrix</b>
          <span>{items.length} cards</span>
        </div>
        <button className="btn primary" onClick={() => setCreating((v) => !v)}>
          <Plus size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          NEW CARD
        </button>
      </div>

      <div className="page-body" style={{ padding: 'var(--pad-1)' }}>
        {creating && (
          <div className="chart-card" style={{ marginBottom: 'var(--pad-1)' }}>
            <div className="chart-hd">
              <span>Create roadmap card</span>
              <span style={{ color: 'var(--text-4)' }}>backlog</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 'var(--pad-1)' }}>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Define objective..."
                style={{ border: '1px solid var(--border-2)', padding: '6px 8px', color: 'var(--text)' }}
              />
              <input
                type="number"
                min={0}
                max={10}
                value={newROI}
                onChange={(e) => setNewROI(Number(e.target.value) || 0)}
                style={{ width: 72, textAlign: 'center', border: '1px solid var(--border-2)', padding: '6px 8px', color: 'var(--accent)' }}
              />
              <button className="btn primary" onClick={handleCreate}>save</button>
            </div>
          </div>
        )}

        <div className="roadmap">
          {COLUMNS.map((column) => {
            const cards = grouped[column.id];
            const highlight = dropTarget === column.id;
            return (
              <div
                key={column.id}
                className={`roadmap-col${column.id === 'in_progress' ? ' in-execution' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropTarget(column.id);
                }}
                onDragLeave={() => setDropTarget((cur) => (cur === column.id ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault();
                  onDropColumn(column.id);
                }}
                style={highlight ? { boxShadow: 'inset 0 0 0 1px var(--accent)' } : undefined}
              >
                <div className="roadmap-col-hd">
                  <span>{column.label}</span>
                  <span className="col-count">{cards.length}</span>
                </div>

                <div className="roadmap-cards">
                  {cards.map((item) => {
                    const verified = VERIFIED.has(item.verification_state);
                    const progress =
                      item.status === 'backlog' ? 4 :
                      item.status === 'todo' ? 28 :
                      item.status === 'in_progress' ? 64 :
                      item.status === 'done' ? 100 : 100;

                    return (
                      <article
                        key={item.id}
                        className={`rcard${item.status === 'in_progress' ? ' executing' : ''}`}
                        draggable
                        onDragStart={() => setDraggingId(item.id)}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDropTarget(null);
                        }}
                      >
                        <div className="rcard-title">{item.title}</div>
                        <div className="rcard-meta">
                          <span>ROI {item.roi_score.toFixed(1)}</span>
                          <span>·</span>
                          <span>{item.lane}</span>
                        </div>
                        <div className="rcard-tags">
                          <span className={`tag ${verified ? 'verified' : 'unverified'}`}>
                            {verified ? 'verified' : 'unverified'}
                          </span>
                          <span className="tag">p{item.priority}</span>
                        </div>
                        <div className="rcard-progress"><div style={{ width: `${progress}%` }} /></div>
                      </article>
                    );
                  })}

                  {!loading && cards.length === 0 && (
                    <div style={{ color: 'var(--text-4)', fontSize: 'var(--fs-sm)', padding: '4px 2px' }}>— empty —</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
