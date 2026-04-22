import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Terminal, 
  Search, 
  Filter, 
  Trash2, 
  RefreshCw, 
  AlertCircle, 
  ShieldCheck, 
  Info,
  Clock,
  Plus
} from 'lucide-react';
import { SystemLog } from '../shared/types';

const aura = (window as any).aura;

const LOG_LEVELS = [
  { value: 'all', label: 'All Levels', color: 'text-zinc-500' },
  { value: 'info', label: 'Info', color: 'text-blue-400', icon: Info },
  { value: 'warn', label: 'Warning', color: 'text-amber-400', icon: AlertCircle },
  { value: 'error', label: 'Error', color: 'text-red-400', icon: AlertCircle },
  { value: 'audit', label: 'Audit', color: 'text-emerald-400', icon: ShieldCheck },
];

export default function SystemLogs() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // New Log Form
  const [newMsg, setNewMsg] = useState('');
  const [newLevel, setNewLevel] = useState<SystemLog['level']>('info');

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await aura.listLogs(200);
      setLogs(data);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLog = async () => {
    if (!newMsg) return;
    try {
      await aura.createLog(newLevel, 'MANUAL_INJECT', newMsg, { timestamp: Date.now() });
      setNewMsg('');
      setIsCreating(false);
      fetchLogs();
    } catch (err) {
      console.error('Failed to create log:', err);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await aura.deleteLog(id);
      fetchLogs();
    } catch (err) {
      console.error('Failed to delete log:', err);
    }
  };

  const filteredLogs = logs.filter(log => {
    const matchesLevel = filterLevel === 'all' || log.level === filterLevel;
    const matchesSearch = log.message.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          log.module.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesLevel && matchesSearch;
  });

  return (
    <div className="flex flex-col h-full bg-aura-panel font-mono text-xs">
      <div className="aura-title-bar shrink-0">
        <div className="flex items-center gap-2">
          <span className="operator-label">Audit Output</span>
          <span className="text-[10px] text-zinc-800">|</span>
          <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">Buffer_Active</span>
        </div>
        <div className="flex items-center gap-4">
           <button onClick={() => setIsCreating(!isCreating)} className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 border border-aura-border hover:bg-aura-accent/10 hover:text-aura-accent transition-all">Inject_Entry</button>
           <button onClick={fetchLogs} className="text-zinc-600 hover:text-white transition-colors">
              <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
           </button>
        </div>
      </div>

      <div className="p-3 bg-aura-bg/30 border-b border-aura-border shrink-0 flex gap-4">
          <div className="flex-1 relative flex items-center h-8 bg-aura-bg border border-aura-border focus-within:border-zinc-700 transition-colors px-3">
             <Search size={10} className="text-zinc-800" />
             <input 
               type="text" 
               placeholder="Filter audit vectors..."
               className="bg-transparent border-none outline-none text-[10px] w-full ml-3 text-zinc-400"
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
             />
          </div>
          <div className="flex border border-aura-border bg-aura-bg h-8 px-1 items-center gap-1">
             {LOG_LEVELS.map(lvl => (
                <button 
                  key={lvl.value}
                  onClick={() => setFilterLevel(lvl.value)}
                  className={`px-2 py-1 text-[8px] font-bold uppercase tracking-widest transition-all ${filterLevel === lvl.value ? 'bg-aura-accent/20 text-aura-accent' : 'text-zinc-700 hover:text-zinc-500'}`}
                >
                  {lvl.label.split(' ')[0]}
                </button>
             ))}
          </div>
      </div>

      <AnimatePresence>
        {isCreating && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden bg-aura-panel border-b border-aura-border shrink-0">
            <div className="p-4 flex gap-4 items-end max-w-4xl">
              <div className="flex-1 flex flex-col gap-2">
                <span className="operator-label text-zinc-700">Message</span>
                <input type="text" className="bg-aura-bg border border-aura-border p-2 text-zinc-300 text-[10px] outline-none focus:border-aura-accent" value={newMsg} onChange={(e) => setNewMsg(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2 w-32">
                <span className="operator-label text-zinc-700">Level</span>
                <select className="bg-aura-bg border border-aura-border p-2 text-zinc-500 text-[10px] outline-none" value={newLevel} onChange={(e) => setNewLevel(e.target.value as any)}>
                   <option value="info">Info</option>
                   <option value="warn">Warn</option>
                   <option value="error">Error</option>
                   <option value="audit">Audit</option>
                </select>
              </div>
              <button onClick={handleCreateLog} className="h-9 px-4 bg-aura-accent/10 border border-aura-accent/30 text-aura-accent text-[9px] font-bold uppercase tracking-widest hover:bg-aura-accent/20 transition-all">Ingest</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 aura-scroll-y p-1 space-y-px">
        {filteredLogs.map((log) => {
          const config = LOG_LEVELS.find(l => l.value === log.level) || LOG_LEVELS[0];
          return (
            <div key={log.id} className="grid grid-cols-[120px_100px_100px_1fr_40px] items-center gap-4 bg-aura-panel/20 hover:bg-aura-accent/[0.03] transition-colors p-2 text-[10px]">
               <span className="text-zinc-700 font-bold tabular-nums">
                 {new Date(log.created_at).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}.{new Date(log.created_at).getMilliseconds().toString().padStart(3, '0')}
               </span>
               <span className={`px-1.5 py-0.5 border border-current font-black text-[8px] text-center w-fit ${config.color}`}>
                 {log.level.toUpperCase()}
               </span>
               <span className="text-zinc-800 font-bold uppercase truncate">{log.module}</span>
               <span className="text-zinc-400 border-l border-aura-border pl-4 leading-relaxed font-sans">{log.message}</span>
               <div className="flex justify-end opacity-0 group-hover:opacity-100">
                  <button onClick={() => handleDelete(log.id)} className="text-zinc-900 hover:text-red-500 transition-colors">
                    <Trash2 size={10} />
                  </button>
               </div>
            </div>
          );
        })}
      </div>

      <div className="aura-title-bar shrink-0 h-6 -mb-px flex justify-between px-4">
         <div className="flex gap-4">
            <span className="text-emerald-900 font-bold text-[8px] uppercase tracking-widest">:: LINK_ESTABLISHED</span>
            <span className="text-zinc-800 font-bold text-[8px] uppercase tracking-widest leading-none pt-1">SEQ: {logs.length} / LEN: 200</span>
         </div>
         <div className="flex gap-4 text-zinc-900 font-bold text-[8px] uppercase tracking-widest">
            <span>ERRORS: {logs.filter(l => l.level === 'error').length}</span>
            <span>MEM: 12.4 MB</span>
         </div>
      </div>
    </div>
  );
}
