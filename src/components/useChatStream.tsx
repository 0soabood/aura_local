import { useState, useCallback, useRef } from 'react';
import { BlackboardEvent } from '../shared/types';

// Helper to access the aura API
function getAura(): any {
  return (window as any).aura;
}

export function useChatStream() {
  const [events, setEvents] = useState<BlackboardEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef(sessionId);
  
  // Keep ref in sync
  sessionIdRef.current = sessionId;

  const sendMessage = useCallback(async (message: string) => {
    setIsStreaming(true);
    setActiveAgent('orchestrator');

    // 1. Optimistically add the user's message to the UI
    const optimisticMsg: BlackboardEvent = {
      id: Date.now(),
      session_id: sessionIdRef.current || 'temp',
      seq: events.length + 1,
      event_type: 'user_message',
      author: 'user',
      content: message,
      created_at: new Date().toISOString(),
      metadata: null
    };
    setEvents(prev => [...prev, optimisticMsg]);

    try {
      // 2. Use the aura IPC bridge for streaming
      const aura = getAura();
      if (!aura) throw new Error('Aura API not available');

      await aura.streamOrchestrate(
        {
          message,
          sessionId: sessionIdRef.current,
          stream: true,
        },
        (eventType: string, data: any) => {
          if (eventType === 'progress') {
            // Agent transition (orchestrator → specialist)
            setActiveAgent(data.agent);
          } else if (eventType === 'agent_event') {
            // Live ReAct trace: thinking, tool calls, agent outputs
            // Accumulate for real-time display during streaming
            setEvents(prev => {
              const newEvent: BlackboardEvent = {
                id: data.id || `temp_${Date.now()}`,
                session_id: sessionIdRef.current || 'temp',
                seq: data.seq || prev.length + 1,
                event_type: data.event_type || data.type || 'agent_output',
                author: data.author || data.agent || 'unknown',
                content: data.content || '',
                created_at: data.created_at || data.timestamp
                  ? new Date(data.timestamp).toISOString()
                  : new Date().toISOString(),
                metadata: { ...data.metadata, _temp: true }
              };
              return [...prev, newEvent];
            });
          } else if (eventType === 'done') {
            // Replace temp streaming events with authoritative server events
            setEvents(prev => {
              const serverEvents = data.events || [];
              // Keep optimistic user message if server hasn't stored it yet
              const serverIds = new Set(serverEvents.map((e: BlackboardEvent) => e.id));
              const optimistic = prev.find(
                e => e.event_type === 'user_message' && !serverIds.has(e.id)
              );
              return optimistic ? [optimistic, ...serverEvents] : serverEvents;
            });
            setSessionId(data.sessionId);
            setActiveAgent(null);
          }
        }
      );
    } catch (err) {
      console.error('Chat stream failed:', err);
      setActiveAgent(null);
    } finally {
      setIsStreaming(false);
    }
  }, []); // Remove events and sessionId from deps - using functional updates and ref

  return { events, isStreaming, activeAgent, sendMessage };
}
