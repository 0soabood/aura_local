import React, { useState, useEffect } from 'react';
import {
  useSessions,
  useActiveSession,
  useFetchSessions,
  useCreateSession,
  useSelectSession,
  useClearChat,
} from '../stores/useAura';

function relativeTime(ts: string | number): string {
  const now = Date.now();
  const then = typeof ts === 'string' ? new Date(ts).getTime() : ts;
  const diff = now - then;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function getStatusInfo(state?: string): { label: string; color: string; bg: string; dot: string } {
  switch (state?.toLowerCase()) {
    case 'running':
    case 'processing':
      return {
        label: 'running',
        color: 'text-green-400',
        bg: 'bg-green-500/10 border-green-500/25',
        dot: 'bg-green-400 animate-pulse',
      };
    case 'error':
      return {
        label: 'error',
        color: 'text-rose-400',
        bg: 'bg-rose-500/10 border-rose-500/25',
        dot: 'bg-rose-400',
      };
    case 'done':
    case 'completed':
      return {
        label: 'done',
        color: 'text-cyan-400/60',
        bg: 'bg-cyan-500/5 border-cyan-500/15',
        dot: 'bg-cyan-400/50',
      };
    default:
      return {
        label: 'idle',
        color: 'text-white/25',
        bg: 'bg-white/5 border-white/10',
        dot: 'bg-white/20',
      };
  }
}

export const SessionsList: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const sessions = useSessions();
  const activeSession = useActiveSession();
  const fetchSessions = useFetchSessions();
  const createSession = useCreateSession();
  const selectSession = useSelectSession();
  const clearChat = useClearChat();
  const [search, setSearch] = useState('');

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const filtered = sessions.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (s.title || '').toLowerCase().includes(q) || s.id.toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-mono text-white/40 tracking-wider">SESSIONS</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-white/15">{sessions.length}</span>
            {onClose && (
              <button
                onClick={onClose}
                className="text-[10px] text-white/20 hover:text-white/50 transition-colors px-1.5 py-0.5 rounded hover:bg-white/[0.03]"
                title="Close panel"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        {/* New Session button */}
        <button
          onClick={async () => { clearChat(); await createSession(); await fetchSessions(); }}
          className="w-full py-2 rounded-lg text-xs font-medium bg-indigo-500/15 border border-indigo-500/25 text-indigo-300 hover:bg-indigo-500/25 hover:border-indigo-500/40 transition-all"
        >
          + New Session
        </button>
      </div>

      {/* Search */}
      {sessions.length > 3 && (
        <div className="px-4 py-2 border-b border-white/5 shrink-0">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search sessions..."
            className="w-full bg-white/[0.03] border border-white/8 rounded-lg px-3 py-1.5 text-[10px] text-white/60 font-mono focus:outline-none focus:border-indigo-500/30 placeholder:text-white/15"
          />
        </div>
      )}

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center">
            <div className="text-xs text-white/15">No sessions yet</div>
          </div>
        )}

        {filtered.map(s => {
          const isActive = activeSession === s.id;
          const status = getStatusInfo(s.state);

          return (
            <button
              key={s.id}
              onClick={() => { selectSession(s.id); clearChat(); }}
              className={`w-full text-left px-4 py-3 border-b border-white/[0.03] transition-all group ${
                isActive
                  ? 'bg-indigo-500/8'
                  : 'hover:bg-white/[0.02]'
              }`}
              style={isActive ? { borderLeft: '2px solid #6366f1' } : {}}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className={`text-xs truncate ${isActive ? 'text-white/80 font-medium' : 'text-white/60'}`}>
                  {s.title || s.id.slice(0, 8)}
                </span>
                <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border shrink-0 ${status.bg} ${status.color}`}>
                  <span className={`w-1 h-1 rounded-full inline-block mr-1 ${status.dot}`} />
                  {status.label}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/15 font-mono">
                  {relativeTime(s.updated_at)}
                </span>
                {s.state && s.state !== 'idle' && (
                  <span className="text-[10px] text-white/10 truncate max-w-[140px]">
                    {s.state}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
