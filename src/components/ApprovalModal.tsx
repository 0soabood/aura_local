import React, { useState } from 'react';
import type { VetoAction } from '../lib/veto/types';
import { useActiveSession, useSetPendingApproval } from '../stores/useAura';

interface ApprovalModalProps {
  action: VetoAction;
}

function getTierLabel(tier: string): { label: string; color: string; bg: string } {
  switch (tier) {
    case 'always': return { label: 'ALWAYS', color: 'text-rose-400', bg: 'bg-rose-500/15 border-rose-500/25' };
    case 'configurable': return { label: 'ASK', color: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/25' };
    case 'never': return { label: 'SAFE', color: 'text-green-400', bg: 'bg-green-500/15 border-green-500/25' };
    default: return { label: tier.toUpperCase(), color: 'text-white/40', bg: 'bg-white/5 border-white/10' };
  }
}

export const ApprovalModal: React.FC<ApprovalModalProps> = ({ action }) => {
  const sessionId = useActiveSession();
  const setPendingApproval = useSetPendingApproval();
  const [showModify, setShowModify] = useState(false);
  const [modifiedArgs, setModifiedArgs] = useState(JSON.stringify(action.toolArgs, null, 2));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState<string | null>(null); // which action is in progress

  const close = () => setPendingApproval(null);

  const handleApprove = async () => {
    if (!sessionId) return;
    setLoading('approve');
    setError('');
    try {
      const res = await fetch(`/api/veto/${action.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => 'Unknown error');
        throw new Error(`Server returned ${res.status}: ${text}`);
      }
      close();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  };

  const handleReject = async () => {
    if (!sessionId) return;
    setLoading('reject');
    setError('');
    try {
      const res = await fetch(`/api/veto/${action.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, notes: notes || undefined }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => 'Unknown error');
        throw new Error(`Server returned ${res.status}: ${text}`);
      }
      close();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(null);
    }
  };

  const handleModify = async () => {
    if (!sessionId) return;
    setLoading('modify');
    setError('');
    try {
      const parsed = JSON.parse(modifiedArgs);
      const res = await fetch(`/api/veto/${action.id}/modify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, modifiedArgs: parsed, notes: notes || undefined }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => 'Unknown error');
        throw new Error(`Server returned ${res.status}: ${text}`);
      }
      close();
    } catch (err: any) {
      if (err instanceof SyntaxError) {
        setError('Invalid JSON in modified arguments');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(null);
    }
  };

  const tier = getTierLabel(action.tier);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={close}>
      <div
        className="bg-[#0d0d1a] border border-white/10 rounded-xl max-w-lg w-full mx-4 shadow-2xl shadow-black/50 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <span className="text-sm">⚠️</span>
            <span className="text-sm font-semibold text-white/80">Approval Required</span>
          </div>
          <button onClick={close} className="text-white/20 hover:text-white/50 transition-colors text-lg leading-none">&times;</button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {/* Tool name + tier badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-white/60 bg-white/[0.04] px-2 py-1 rounded border border-white/5">
                {action.toolName}
              </span>
            </div>
            <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full border ${tier.bg} ${tier.color}`}>
              {tier.label}
            </span>
          </div>

          {/* Description */}
          <p className="text-sm text-white/70 leading-relaxed">{action.description}</p>

          {/* Working directory */}
          {action.workingDirectory && (
            <p className="text-[10px] font-mono text-white/25">
              📁 {action.workingDirectory}
            </p>
          )}

          {/* Cost estimate */}
          {action.estimatedCost !== undefined && (
            <p className="text-[10px] font-mono text-amber-400/60">
              💰 Estimated cost: ${action.estimatedCost.toFixed(4)}
            </p>
          )}

          {/* Args preview */}
          <details className="group">
            <summary className="text-[10px] font-mono text-white/30 cursor-pointer hover:text-white/50 transition-colors select-none">
              View Arguments ▸
            </summary>
            <pre className="mt-2 bg-[#0a0a14] border border-white/5 rounded-lg p-3 text-[10px] font-mono text-white/40 overflow-x-auto max-h-40 leading-relaxed">
              {JSON.stringify(action.toolArgs, null, 2)}
            </pre>
          </details>

          {/* Modify section */}
          {showModify && (
            <div className="space-y-2 p-3 bg-[#0a0a14] border border-white/5 rounded-lg">
              <label className="text-[10px] font-mono text-white/30">Modified Arguments (JSON):</label>
              <textarea
                className="w-full bg-white/[0.02] border border-white/10 rounded-lg p-2 text-[10px] font-mono text-white/60 focus:outline-none focus:border-indigo-500/40 resize-none"
                rows={5}
                value={modifiedArgs}
                onChange={(e) => setModifiedArgs(e.target.value)}
              />
              <label className="text-[10px] font-mono text-white/30">Notes:</label>
              <input
                type="text"
                className="w-full bg-white/[0.02] border border-white/10 rounded-lg px-3 py-1.5 text-[11px] text-white/60 focus:outline-none focus:border-indigo-500/40"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional reviewer notes..."
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-[10px] font-mono text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-white/5 bg-[#0a0a14]">
          <button
            onClick={handleApprove}
            disabled={loading !== null}
            className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-b from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-all shadow-lg shadow-green-500/10"
          >
            {loading === 'approve' ? '···' : '✓ Approve'}
          </button>
          <button
            onClick={() => setShowModify(!showModify)}
            disabled={loading !== null}
            className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-all shadow-lg shadow-amber-500/10"
          >
            {showModify ? '✎ Hide Modify' : '✎ Modify'}
          </button>
          {showModify && (
            <button
              onClick={handleModify}
              disabled={loading !== null}
              className="px-4 py-2 rounded-lg bg-gradient-to-b from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-all shadow-lg shadow-indigo-500/10"
            >
              {loading === 'modify' ? '···' : '✓ Approve Modified'}
            </button>
          )}
          <button
            onClick={handleReject}
            disabled={loading !== null}
            className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-b from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-all shadow-lg shadow-rose-500/10"
          >
            {loading === 'reject' ? '···' : '✗ Reject'}
          </button>
        </div>
      </div>
    </div>
  );
};
