import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Search, 
  Trash2, 
  BookOpen, 
  Tag, 
  FileText,
  Activity,
  Database,
  ShieldCheck
} from 'lucide-react';
import { ResearchSnippet } from '../shared/types';
import VerificationBadge from './ui/VerificationBadge';
import '../preload/index';

const aura = (window as any).aura;

export default function ResearchConsole() {
  const [snippets, setSnippets] = useState<ResearchSnippet[]>([]);
  const [activeSnippet, setActiveSnippet] = useState<ResearchSnippet | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newTags, setNewTags] = useState('');

  // Verification Edit State
  const [isVerifying, setIsVerifying] = useState(false);
  const [vReasoning, setVReasoning] = useState('');

  useEffect(() => {
    loadSnippets();
  }, []);

  const loadSnippets = async () => {
    try {
      const data = await aura.getSnippets();
      setSnippets(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateVerification = async (state: ResearchSnippet['verification_state']) => {
    if (!activeSnippet) return;
    try {
      await aura.updateSnippet(activeSnippet.id, { 
        verification_state: state,
        verification_reasoning: vReasoning 
      });
      setIsVerifying(false);
      setVReasoning('');
      loadSnippets();
      setActiveSnippet({ ...activeSnippet, verification_state: state, verification_reasoning: vReasoning });
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreate = async () => {
    if (!newTitle) return;
    try {
      await aura.createSnippet({
        title: newTitle,
        content: newContent,
        tags: newTags.split(',').map(t => t.trim()).filter(Boolean),
      });
      setNewTitle('');
      setNewContent('');
      setNewTags('');
      setIsCreating(false);
      loadSnippets();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await aura.deleteSnippet(id);
      if (activeSnippet?.id === id) setActiveSnippet(null);
      loadSnippets();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredSnippets = snippets.filter(s => 
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-full w-full bg-aura-panel font-mono text-zinc-400">
      <aside className="w-64 border-r border-aura-border flex flex-col shrink-0">
        <div className="aura-title-bar">
          <span className="operator-label">Vault Explorer</span>
          <button onClick={() => setIsCreating(true)} className="text-zinc-600 hover:text-aura-accent">
            <Plus size={12} />
          </button>
        </div>
        
        <div className="p-3 border-b border-aura-border bg-aura-bg/30">
          <div className="relative flex items-center gap-2 px-2 h-7 bg-aura-bg border border-aura-border focus-within:border-zinc-700 transition-colors">
            <Search size={10} className="text-zinc-800" />
            <input 
              type="text" 
              placeholder="Filter storage..."
              className="bg-transparent border-none outline-none text-[10px] w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 aura-scroll-y">
          {loading ? (
            <div className="flex justify-center py-10"><Activity className="animate-spin text-zinc-800" size={16} /></div>
          ) : filteredSnippets.length === 0 ? (
            <div className="p-4 text-[9px] text-zinc-800 text-center uppercase tracking-widest leading-relaxed">No local sync modules identified</div>
          ) : (
            <div className="divide-y divide-aura-border/20">
              {filteredSnippets.map((snippet) => (
                <div
                  key={snippet.id}
                  onClick={() => { setActiveSnippet(snippet); setIsCreating(false); }}
                  className={`p-3 cursor-pointer transition-all hover:bg-aura-accent/5 ${
                    activeSnippet?.id === snippet.id ? 'bg-aura-accent/10 border-r-2 border-aura-accent' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-zinc-300 truncate tracking-tight">{snippet.title}</span>
                    <VerificationBadge state={snippet.verification_state} showLabel={false} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] text-zinc-700 uppercase tracking-widest truncate max-w-[120px]">
                      {JSON.parse(snippet.tags).join(' / ')}
                    </span>
                    <button onClick={(e) => handleDelete(snippet.id, e)} className="text-zinc-900 hover:text-red-500 transition-colors">
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-aura-bg/30 relative">
        <AnimatePresence mode="wait">
          {isCreating ? (
            <motion.div key="editor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col p-8">
              <div className="aura-title-bar mb-6 -mx-8 -mt-8">
                <span className="operator-label">Memory Initialization</span>
                <span className="text-[10px] text-zinc-800 tracking-widest font-bold uppercase">Ready</span>
              </div>
              <div className="max-w-4xl w-full mx-auto space-y-6">
                <div>
                  <span className="operator-label mb-2 block text-zinc-700">Payload Identifier</span>
                  <input type="text" placeholder="TITLE_STRING" className="w-full bg-aura-panel border border-aura-border p-3 text-zinc-200 text-sm focus:border-aura-accent outline-none" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} autoFocus />
                </div>
                <div>
                  <span className="operator-label mb-2 block text-zinc-700">Classification Tags</span>
                  <input type="text" placeholder="tag_01, tag_02..." className="w-full bg-aura-panel border border-aura-border p-3 text-aura-accent text-[10px] focus:border-aura-accent outline-none" value={newTags} onChange={(e) => setNewTags(e.target.value)} />
                </div>
                <div className="flex-1 min-h-[300px] flex flex-col">
                  <span className="operator-label mb-2 block text-zinc-700">Intelligence Body</span>
                  <textarea placeholder="Begin recording intelligence vectors..." className="flex-1 w-full bg-aura-panel border border-aura-border p-4 text-zinc-400 text-xs font-mono leading-relaxed focus:border-aura-accent outline-none resize-none" value={newContent} onChange={(e) => setNewContent(e.target.value)} />
                </div>
                <div className="flex gap-4 pt-4">
                  <button onClick={handleCreate} className="px-6 py-2 bg-aura-accent/10 hover:bg-aura-accent/20 border border-aura-accent/50 text-aura-accent text-[10px] font-bold uppercase tracking-widest">Commit to Sync</button>
                  <button onClick={() => setIsCreating(false)} className="px-6 py-2 bg-zinc-900 text-zinc-600 text-[10px] font-bold uppercase tracking-widest">Abort</button>
                </div>
              </div>
            </motion.div>
          ) : activeSnippet ? (
            <motion.div key={activeSnippet.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col h-full">
               <div className="aura-title-bar shrink-0">
                  <div className="flex items-center gap-3">
                    <span className="operator-label">Module Viewer</span>
                    <span className="text-[10px] text-zinc-800">|</span>
                    <span className="text-[10px] text-zinc-600 uppercase font-bold tracking-widest truncate">
                      {activeSnippet.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <VerificationBadge state={activeSnippet.verification_state} />
                  </div>
               </div>

               <div className="flex-1 aura-scroll-y p-8">
                 <div className="max-w-4xl mx-auto">
                    <div className="mb-8 flex items-center justify-between border-b border-aura-border pb-4">
                      <div className="flex gap-2">
                        {JSON.parse(activeSnippet.tags).map((tag: string) => (
                           <span key={tag} className="text-[9px] bg-aura-bg border border-aura-border text-zinc-600 px-2 py-0.5 rounded-sm uppercase font-bold tracking-widest">{tag}</span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                         <button onClick={() => handleUpdateVerification('source_checked')} className="p-1 px-3 border border-aura-border hover:border-amber-500/50 hover:text-amber-500 text-[9px] font-bold uppercase tracking-widest transition-all">Verify Source</button>
                         <button onClick={() => handleUpdateVerification('accepted')} className="p-1 px-3 border border-aura-border hover:border-aura-success/50 hover:text-aura-success text-[9px] font-bold uppercase tracking-widest transition-all">Accept Fact</button>
                      </div>
                    </div>

                    <div className="font-mono text-xs leading-relaxed text-zinc-300 whitespace-pre-wrap selection:bg-aura-accent/20">
                      {activeSnippet.content}
                    </div>

                    {activeSnippet.verification_reasoning && (
                      <div className="mt-12 p-4 bg-aura-panel border border-aura-border border-l-aura-accent border-l-2">
                        <span className="operator-label block mb-2 text-zinc-700">Verification Trail</span>
                        <p className="text-[10px] text-zinc-500 italic leading-relaxed">“{activeSnippet.verification_reasoning}”</p>
                      </div>
                    )}
                 </div>
               </div>
            </motion.div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center opacity-10">
              <Database size={64} strokeWidth={1} />
              <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.5em]">Synchronized Vault / Standby</p>
            </div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
