import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Terminal, 
  Play, 
  Plus, 
  History, 
  Command, 
  ChevronRight,
  Cpu,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Trash2
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { ModelRun } from '../shared/types';
import { CoreModelService } from '../lib/CoreModelService';

const aura = (window as any).aura;
const modelService = new CoreModelService();

export default function CoreTerminal() {
  const [input, setInput] = useState('');
  const [runs, setRuns] = useState<ModelRun[]>([]);
  const [activeRun, setActiveRun] = useState<ModelRun | null>(null);
  const [executing, setExecuting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadRuns();
  }, []);

  const loadRuns = async () => {
    const data = await aura.listModelRuns(50);
    setRuns(data);
    if (data.length > 0 && !activeRun) setActiveRun(data[0]);
  };

  const handleExecute = async () => {
    if (!input.trim() || executing) return;
    setExecuting(true);
    const modelId = "gemini-3-flash-preview";

    try {
      // 1. Create Run in DB
      const { id } = await aura.createModelRun({
        model_id: modelId,
        prompt: input,
        status: 'running'
      });

      // 2. Execute via ModelService
      const result = await modelService.execute(input, modelId);
      
      // 3. Update DB with result
      await aura.updateModelRun(id, {
        response: result.response,
        status: result.status,
        latency_ms: result.latency
      });

      await loadRuns();
      setInput('');
      // Select the newest run
      const latest = await aura.listModelRuns(1);
      if (latest.length > 0) setActiveRun(latest[0]);
    } catch (err) {
      console.error(err);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="flex h-full bg-aura-panel font-mono text-zinc-400">
      {/* Session History Sidebar */}
      <aside className="w-56 border-r border-aura-border flex flex-col shrink-0">
        <div className="aura-title-bar">
          <span className="operator-label text-[9px]">Kernel Logs</span>
          <Plus size={10} className="text-zinc-600 hover:text-aura-accent cursor-pointer" />
        </div>
        <div className="flex-1 aura-scroll-y divide-y divide-aura-border/20">
          {runs.map((run) => (
            <button
              key={run.id}
              onClick={() => setActiveRun(run)}
              className={`w-full text-left p-2.5 transition-colors hover:bg-aura-accent/5 ${
                activeRun?.id === run.id ? 'bg-aura-accent/5 border-l-2 border-aura-accent' : 'border-l-2 border-transparent'
              }`}
            >
              <div className="text-[9px] text-zinc-600 mb-1 flex items-center justify-between">
                <span>{new Date(run.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span>
                {run.status === 'completed' ? <ShieldCheck size={10} className="text-aura-success" /> : <div className="w-1.5 h-1.5 rounded-full bg-aura-warn/50" />}
              </div>
              <div className="text-[10px] font-bold text-zinc-400 truncate tracking-tight">{run.prompt}</div>
            </button>
          ))}
        </div>
      </aside>

      {/* Main Orchestration Canvas */}
      <section className="flex-1 flex flex-col min-w-0 bg-aura-bg/30">
        <div className="aura-title-bar shrink-0">
          <div className="flex items-center gap-2">
            <span className="operator-label text-[9px]">Stdout Viewer</span>
            <span className="text-[9px] text-zinc-800">|</span>
            <span className="text-[9px] text-zinc-700 font-mono uppercase truncate max-w-[200px]">
              {activeRun?.id || 'NO_SESSION'}
            </span>
          </div>
          <div className="flex items-center gap-4">
             {executing && (
               <div className="flex items-center gap-2">
                 <Loader2 size={10} className="animate-spin text-aura-accent" />
                 <span className="text-[8px] font-bold text-aura-accent uppercase animate-pulse">Processing</span>
               </div>
             )}
             <Trash2 size={10} className="text-zinc-800 hover:text-red-500 cursor-pointer" />
          </div>
        </div>

        <div className="flex-1 aura-scroll-y p-8">
          {activeRun ? (
            <div className="max-w-4xl mx-auto">
              <div className="mb-12">
                <div className="operator-label mb-3 flex items-center gap-2 text-zinc-700">
                  <Command size={10} /> DISPATCHED_COMMAND
                </div>
                <div className="p-4 bg-aura-panel/50 border border-aura-border text-zinc-300 border-l-aura-accent border-l-2 leading-relaxed text-xs">
                  {activeRun.prompt}
                </div>
              </div>

              <div className="operator-label mb-4 flex items-center gap-2 text-zinc-700">
                <Cpu size={10} /> INTELLIGENCE_PAYLOAD
              </div>
              
              <div className="p-6 aura-panel rounded-sm bg-aura-panel/20">
                <div className="markdown-body prose prose-invert prose-xs max-w-none font-mono">
                  <ReactMarkdown>{activeRun.response || "_Pending buffer stream..._"}</ReactMarkdown>
                </div>
              </div>

              <div className="mt-12 pt-8 border-t border-aura-border flex flex-wrap gap-12">
                <div className="flex flex-col gap-1.5">
                  <span className="operator-label text-zinc-700">Audit State</span>
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={12} className={activeRun.verification_state === 'accepted' ? 'text-aura-success' : 'text-zinc-800'} />
                    <span className="text-[10px] text-zinc-400 capitalize font-bold">{activeRun.verification_state}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="operator-label text-zinc-700">Metric Bundle</span>
                  <span className="text-[10px] text-zinc-500 font-mono uppercase">
                    {activeRun.latency_ms || 0}ms / {activeRun.tokens_output || 0}T
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="operator-label text-zinc-700">Substrate Trace</span>
                  <span className="text-[10px] text-zinc-500 font-mono uppercase">{activeRun.model_id}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center opacity-10">
              <Terminal size={48} strokeWidth={1} />
              <p className="mt-4 text-[9px] font-bold uppercase tracking-[0.4em]">Ready for kernel initialization</p>
            </div>
          )}
        </div>

        {/* Console Input Bar */}
        <div className="p-4 border-t border-aura-border bg-aura-panel/30 shrink-0">
          <div className="max-w-4xl mx-auto flex items-center gap-4 bg-aura-bg/80 border border-aura-border px-4 h-12 focus-within:border-aura-accent/30 transition-all shadow-inner">
            <span className="text-aura-accent/50 font-bold text-xs font-mono">::</span>
            <input
              type="text"
              placeholder="Orchestrate next intelligence run..."
              className="flex-1 bg-transparent border-none outline-none text-zinc-300 placeholder-zinc-800 text-xs font-mono"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleExecute()}
            />
            <div className="flex items-center gap-4">
              <span className="text-[9px] text-zinc-800 font-mono hidden md:block">CMD+ENTER to EXEC</span>
              <button 
                disabled={executing || !input.trim()}
                onClick={handleExecute}
                className="p-1 px-4 bg-aura-accent/10 hover:bg-aura-accent/20 border border-aura-accent/20 text-aura-accent rounded-sm text-[9px] font-bold uppercase tracking-widest disabled:opacity-20 transition-all active:scale-95"
              >
                EXEC
              </button>
            </div>
          </div>
        </div>
      </section>

      <style dangerouslySetInnerHTML={{ __html: `
        .markdown-body h1 { @apply text-zinc-200 text-xs font-bold uppercase border-b border-aura-border pb-2 mt-8 mb-4 tracking-widest; }
        .markdown-body h2 { @apply text-zinc-400 text-[11px] font-bold uppercase mt-6 mb-3 tracking-widest; }
        .markdown-body p { @apply text-zinc-500 leading-relaxed mb-4 text-[11px]; }
        .markdown-body ul { @apply mb-4; }
        .markdown-body li { @apply text-zinc-500 text-[11px] mb-1.5 flex gap-2; }
        .markdown-body li::before { content: "::"; @apply text-aura-accent font-bold; }
        .markdown-body strong { @apply text-aura-accent font-bold; }
        .markdown-body code { @apply bg-aura-bg px-1.5 py-0.5 rounded text-aura-accent font-mono text-[10px]; }
      `}} />
    </div>
  );
}
