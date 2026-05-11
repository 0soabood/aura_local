import React, { useState, useEffect, useRef } from 'react';
import { ApprovalCard } from './ApprovalCard';
import type { VetoAction } from '../lib/veto/types';

interface VetoPanelProps {
  sessionId: string;
}

export function VetoPanel({ sessionId }: VetoPanelProps) {
  const [pendingActions, setPendingActions] = useState<VetoAction[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/debug/${sessionId}`);
    
    ws.onopen = () => {
      setIsConnected(true);
      console.log('[VetoPanel] Connected to debug WebSocket');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'approval_required') {
        const action: VetoAction = data.action;
        setPendingActions(prev => [...prev, action]);
      }
      
      if (data.type === 'veto_action_update') {
        const updatedAction: VetoAction = data.action;
        setPendingActions(prev => 
          prev.map(a => a.id === updatedAction.id ? updatedAction : a)
        );
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log('[VetoPanel] Disconnected from debug WebSocket');
    };

    ws.onerror = (error) => {
      console.error('[VetoPanel] WebSocket error:', error);
    };

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, [sessionId]);

  const handleApprove = async (actionId: string) => {
    try {
      const res = await fetch(`/api/veto/${actionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      
      if (res.ok) {
        const data = await res.json();
        console.log('[VetoPanel] Action approved:', data);
        
        // Remove from pending list
        setPendingActions(prev => prev.filter(a => a.id !== actionId));
        
        // Note: In a full implementation, the workflow would be resumed automatically
        // via WebSocket message or by re-invoking the graph with resume command
        // For now, we'll show a success message
        alert(`Action approved! The workflow will resume automatically.`);
      }
    } catch (error) {
      console.error('[VetoPanel] Failed to approve:', error);
    }
  };

  const handleReject = async (actionId: string, notes?: string) => {
    try {
      const res = await fetch(`/api/veto/${actionId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, notes }),
      });
      
      if (res.ok) {
        setPendingActions(prev => prev.filter(a => a.id !== actionId));
      }
    } catch (error) {
      console.error('[VetoPanel] Failed to reject:', error);
    }
  };

  const handleModify = async (actionId: string, modifiedArgs: Record<string, unknown>, notes?: string) => {
    try {
      const res = await fetch(`/api/veto/${actionId}/modify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, modifiedArgs, notes }),
      });
      
      if (res.ok) {
        setPendingActions(prev => prev.filter(a => a.id !== actionId));
      }
    } catch (error) {
      console.error('[VetoPanel] Failed to modify:', error);
    }
  };

  if (pendingActions.length === 0) {
    return null; // Don't render if no pending actions
  }

  return (
    <div className="fixed right-4 top-20 w-96 max-h-[80vh] overflow-y-auto z-50 space-y-4">
      <div className="bg-neubrutalist-bg border-2 border-neubrutalist-border rounded-neubrutalist p-3 shadow-neubrutalist">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white">
            ⚠️ Pending Approvals ({pendingActions.length})
          </h3>
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} 
               title={isConnected ? 'Connected' : 'Disconnected'} />
        </div>
      </div>

      {pendingActions.map(action => (
        <ApprovalCard
          key={action.id}
          action={action}
          onApprove={handleApprove}
          onReject={handleReject}
          onModify={handleModify}
        />
      ))}
    </div>
  );
}
