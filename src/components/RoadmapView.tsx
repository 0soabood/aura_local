import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Hash, 
  Plus, 
  ChevronRight, 
  TrendingUp, 
  Clock, 
  Trash2, 
  CheckCircle2, 
  Circle,
  AlertCircle,
  MoreVertical,
  Filter,
  Layers,
  Zap
} from 'lucide-react';
import { RoadmapItem, WorkflowStatus } from '../shared/types';

const aura = (window as any).aura;

const STATUS_CONFIG: Record<WorkflowStatus, { label: string, color: string, icon: any }> = {
  backlog: { label: 'BACKLOG', color: 'text-zinc-600', icon: Circle },
  todo: { label: 'TODO_QUEUE', color: 'text-aura-accent', icon: Circle },
  in_progress: { label: 'IN_EXECUTION', color: 'text-aura-warn', icon: Clock },
  done: { label: 'CONCLUDED', color: 'text-aura-success', icon: CheckCircle2 },
  archived: { label: 'ARCHIVED', color: 'text-zinc-900', icon: Layers },
};

export default function RoadmapView() {
  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  
  const [newTitle, setNewTitle] = useState('');
  const [newROI, setNewROI] = useState(0);

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const data = await aura.listRoadmapItems();
      setItems(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newTitle) return;
    try {
      await aura.createRoadmapItem({
        title: newTitle,
        roi_score: newROI,
        lane: 'CORE_STRAT',
        priority: Math.floor(newROI / 2),
      });
      setNewTitle('');
      setNewROI(0);
      setIsCreating(false);
      fetchItems();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateStatus = async (id: string, status: WorkflowStatus) => {
    try {
      await aura.updateRoadmapItem(id, { status });
      fetchItems();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await aura.deleteRoadmapItem(id);
      fetchItems();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-aura-panel font-mono text-zinc-400">
      <div className="aura-title-bar shrink-0">
        <div className="flex items-center gap-2">
          <span className="operator-label">Strategic Timeline</span>
          <span className="text-[10px] text-zinc-800">|</span>
          <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">Active Milestones</span>
        </div>
        <button 
          onClick={() => setIsCreating(true)}
          className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 border border-aura-border hover:bg-aura-accent/10 hover:text-aura-accent transition-all"
        >
          Inject_Goal
        </button>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden aura-scroll-x">
        <div className="flex gap-px bg-aura-border/20 h-full min-w-max">
          {Object.entries(STATUS_CONFIG).filter(([k]) => k !== 'archived').map(([status, config]) => (
            <div key={status} className="w-80 flex flex-col bg-aura-panel/40">
              <div className="p-3 border-b border-aura-border bg-aura-bg/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-1 h-3 rounded-full ${config.color.replace('text-', 'bg-')}`} />
                  <h2 className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500">{config.label}</h2>
                  <span className="text-[8px] font-bold text-zinc-700 bg-aura-bg border border-aura-border px-1.5 py-0.5 leading-none">
                    {items.filter(i => i.status === status).length}
                  </span>
                </div>
              </div>

              <div className="flex-1 aura-scroll-y p-3 space-y-3">
                <AnimatePresence mode="popLayout">
                  {status === 'todo' && isCreating && (
                    <motion.div 
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="aura-panel p-4 bg-aura-accent/[0.03] border-aura-accent/30 space-y-4"
                    >
                      <div className="flex flex-col gap-1.5">
                        <span className="operator-label text-zinc-700">Directive</span>
                        <input className="bg-aura-bg border border-aura-border p-2 text-[10px] outline-none text-zinc-300" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} autoFocus />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <span className="operator-label text-zinc-700">Magnitude</span>
                        <input type="number" className="bg-aura-bg border border-aura-border p-2 text-[10px] text-center w-12 outline-none text-aura-accent" value={newROI} onChange={(e) => setNewROI(Number(e.target.value))} />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleCreate} className="flex-1 p-1 bg-aura-accent/10 border border-aura-accent/30 text-aura-accent text-[9px] font-bold uppercase tracking-widest">Commit</button>
                        <button onClick={() => setIsCreating(false)} className="p-1 px-3 text-zinc-800 text-[9px] font-bold uppercase tracking-widest">Esc</button>
                      </div>
                    </motion.div>
                  )}

                  {items.filter(i => i.status === status).map((item) => (
                    <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} key={item.id} className="aura-panel p-3 bg-aura-bg/20 border-aura-border hover:border-zinc-800 transition-all group">
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="text-[11px] font-bold text-zinc-200 leading-normal tracking-tight">{item.title}</h3>
                        <button onClick={() => handleDelete(item.id)} className="opacity-0 group-hover:opacity-100 text-zinc-900 hover:text-red-500 transition-all">
                          <Trash2 size={10} />
                        </button>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 text-[8px] font-bold text-aura-accent">
                          <Zap size={8} />
                          <span>MGR: {item.roi_score.toFixed(1)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[8px] font-bold text-zinc-800 uppercase tracking-widest">
                          <Layers size={8} />
                          <span>{item.lane}</span>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-aura-border/50 flex gap-2">
                        {status === 'todo' && (
                          <button onClick={() => handleUpdateStatus(item.id, 'in_progress')} className="flex-1 py-1 bg-aura-accent/10 border border-aura-accent/20 hover:bg-aura-accent/20 text-aura-accent text-[8px] font-bold uppercase tracking-widest transition-all">Engage</button>
                        )}
                        {status === 'in_progress' && (
                          <button onClick={() => handleUpdateStatus(item.id, 'done')} className="flex-1 py-1 bg-aura-success/10 border border-aura-success/20 hover:bg-aura-success/20 text-aura-success text-[8px] font-bold uppercase tracking-widest transition-all">Conclude</button>
                        )}
                        {status !== 'todo' && (
                           <button onClick={() => handleUpdateStatus(item.id, 'todo')} className="p-1 px-2 text-zinc-800 hover:text-zinc-500 text-[8px] font-bold uppercase tracking-widest transition-all">Reset</button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
