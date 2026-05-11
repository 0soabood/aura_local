import React, { useState, useEffect } from 'react';
import type { VetoAction, VetoActionStatus } from '../lib/veto/types';

interface ApprovalCardProps {
  action: VetoAction;
  onApprove: (actionId: string) => void;
  onReject: (actionId: string, notes?: string) => void;
  onModify: (actionId: string, modifiedArgs: Record<string, unknown>, notes?: string) => void;
}

export function ApprovalCard({ action, onApprove, onReject, onModify }: ApprovalCardProps) {
  const [showModify, setShowModify] = useState(false);
  const [modifiedArgs, setModifiedArgs] = useState(JSON.stringify(action.toolArgs, null, 2));
  const [notes, setNotes] = useState('');

  const getTierBadgeColor = (tier: string) => {
    switch (tier) {
      case 'never': return 'bg-green-600';
      case 'always': return 'bg-red-600';
      case 'configurable': return 'bg-yellow-600';
      default: return 'bg-gray-600';
    }
  };

  return (
    <div className="border border-neubrutalist-border bg-neubrutalist-bg p-4 rounded-neubrutalist shadow-neubrutalist">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded text-xs font-bold text-white ${getTierBadgeColor(action.tier)}`}>
            {action.tier.toUpperCase()}
          </span>
          <span className="text-sm text-gray-400">{action.toolName}</span>
        </div>
        <span className="text-xs text-gray-500">
          {new Date(action.timestamp).toLocaleTimeString()}
        </span>
      </div>

      <div className="mb-3">
        <p className="text-sm text-gray-300 mb-2">{action.description}</p>
        
        {action.workingDirectory && (
          <p className="text-xs text-gray-500 font-mono">
            Working directory: {action.workingDirectory}
          </p>
        )}
        
        {action.estimatedCost !== undefined && (
          <p className="text-xs text-yellow-500">
            Estimated cost: ${action.estimatedCost.toFixed(4)}
          </p>
        )}
      </div>

      {action.diff && (
        <div className="mb-3">
          <p className="text-xs text-gray-400 mb-1">Diff preview:</p>
          <pre className="bg-gray-900 p-2 rounded text-xs overflow-x-auto max-h-32 whitespace-pre-wrap">
            <code className="text-green-400">
              {action.diff.split('\n').map((line: string, i: number) => (
                <div key={i} className={line.startsWith('+') ? 'text-green-400' : line.startsWith('-') ? 'text-red-400' : 'text-gray-500'}>
                  {line}
                </div>
              ))}
            </code>
          </pre>
        </div>
      )}

      {action.toolName === 'run_command' && action.toolArgs && (
        <div className="mb-3">
          <p className="text-xs text-gray-400 mb-1">Shell Command:</p>
          <div className="bg-gray-900 p-2 rounded text-xs">
            <code className="text-yellow-400 font-mono">
              {action.workingDirectory && <span className="text-gray-500">[{action.workingDirectory}]$ </span>}
              {String((action.toolArgs as any).command || 'unknown command')}
            </code>
          </div>
        </div>
      )}

      {action.toolName.includes('etsy') && action.toolArgs && (
        <div className="mb-3">
          <p className="text-xs text-gray-400 mb-1">Etsy Listing Preview:</p>
          <div className="bg-gray-900 p-2 rounded text-xs space-y-1">
            {(action.toolArgs as any).title && (
              <p><span className="text-gray-500">Title:</span> <span className="text-blue-400">{(action.toolArgs as any).title}</span></p>
            )}
            {(action.toolArgs as any).price && (
              <p><span className="text-gray-500">Price:</span> <span className="text-green-400">${(action.toolArgs as any).price}</span></p>
            )}
            {(action.toolArgs as any).description && (
              <p><span className="text-gray-500">Description:</span> <span className="text-gray-300">{(action.toolArgs as any).description.slice(0, 100)}...</span></p>
            )}
          </div>
        </div>
      )}

      <details className="mb-3">
        <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-300">
          View Arguments
        </summary>
        <pre className="bg-gray-900 p-2 rounded text-xs mt-1 overflow-x-auto max-h-32">
          <code className="text-blue-400">
            {JSON.stringify(action.toolArgs, null, 2)}
          </code>
        </pre>
      </details>

      {showModify && (
        <div className="mb-3 space-y-2">
          <div>
            <label className="text-xs text-gray-400">Modified Arguments (JSON):</label>
            <textarea
              className="w-full bg-gray-900 border border-neubrutalist-border rounded p-2 text-xs font-mono text-gray-300"
              rows={6}
              value={modifiedArgs}
              onChange={(e) => setModifiedArgs(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">Notes:</label>
            <input
              type="text"
              className="w-full bg-gray-900 border border-neubrutalist-border rounded p-2 text-xs text-gray-300"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional reviewer notes..."
            />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-bold text-sm transition-colors"
          onClick={() => onApprove(action.id)}
        >
          ✓ Approve
        </button>
        
        <button
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-bold text-sm transition-colors"
          onClick={() => onReject(action.id, notes || undefined)}
        >
          ✗ Reject
        </button>
        
        <button
          className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded font-bold text-sm transition-colors"
          onClick={() => {
            try {
              const parsed = JSON.parse(modifiedArgs);
              onModify(action.id, parsed, notes || undefined);
            } catch {
              alert('Invalid JSON in modified arguments');
            }
          }}
          onMouseEnter={() => setShowModify(true)}
        >
          ✎ Modify
        </button>
      </div>
    </div>
  );
}
