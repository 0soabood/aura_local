import { useEffect, useState } from 'react';

interface BlackboardEvent {
  event_type: string;
  content?: string;
  agentName?: string;
  confidence?: number;
  metadata?: any;
  timestamp: number;
}

export function DebugPanel({ threadId }: { threadId: string }) {
  const [events, setEvents] = useState<BlackboardEvent[]>([]);

  useEffect(() => {
    if (!threadId) return;
    const ws = new WebSocket(`ws://localhost:3000/api/debug/${threadId}`);
    ws.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data);
        setEvents(prev => [...prev, event]);
      } catch (e) {
        console.error('Failed to parse debug event', e);
      }
    };
    return () => ws.close();
  }, [threadId]);

  return (
    <div style={{ width: '100%', padding: 12, fontFamily: 'monospace', fontSize: 12 }}>
      <h3>🔍 Orchestration Debug</h3>
      <div style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        {events.map((e, i) => (
          <div key={i} style={{ marginBottom: 8, padding: 6, borderRadius: 4, background: bgFor(e.event_type), color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{e.event_type}</strong>
              <span style={{ color: '#888' }}>{new Date(e.timestamp).toLocaleTimeString()}</span>
            </div>
            {e.agentName && <div>agent: {e.agentName} ({e.confidence?.toFixed(2)})</div>}
            {e.metadata?.model_id && <div>model: {e.metadata.model_id}</div>}
            {e.metadata?.latency_ms && <div>latency: {e.metadata.latency_ms}ms</div>}
            {e.content && <pre style={{ marginTop: 4, whiteSpace: 'pre-wrap', overflowX: 'hidden' }}>{e.content.slice(0, 200)}</pre>}
          </div>
        ))}
      </div>
    </div>
  );
}

function bgFor(type: string): string {
  switch (type) {
    case 'user_message': return '#1a1a2e';
    case 'agent_bid': return '#16213e';
    case 'synthesis_complete': return '#0f3460';
    case 'escalation_required': return '#e94560';
    case 'task_proposed': return '#533483';
    case 'code_written': return '#004d40';
    case 'agent_output': return '#33691e';
    default: return '#1a1a1a';
  }
}