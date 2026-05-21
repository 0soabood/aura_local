import { debugEmitter } from './debug';
import { BlackboardEventRepository } from '../db/repositories/BlackboardEventRepository';

/**
 * Event types from the ReAct loop that should be persisted to the DB
 * so they survive session reloads. These are currently broadcast via
 * broadcastEvent() but never stored — making them ephemeral.
 */
const PERSISTED_EVENT_TYPES = new Set([
  'react_think',
  'react_verbose',
  'react_act',
  'react_observe',
  'agent_bid',
]);

/**
 * Activate persistence for diagnostic events.
 *
 * Listens to the shared debugEmitter and persists any event whose
 * event_type is in PERSISTED_EVENT_TYPES.  This is purely additive —
 * existing broadcastEvent() callers are untouched, and events that
 * are already persisted via appendAndBroadcast() are not re-stored.
 *
 * Call once per session when the orchestrator starts streaming.
 */
export function persistDiagnosticEvents(sessionId: string): void {
  const handler = (payload: any) => {
    const eventType = payload.event_type || payload.type;
    if (!eventType || !PERSISTED_EVENT_TYPES.has(eventType)) return;
    // Don't re-store events that were already persisted by the orchestrator
    if (['user_message', 'synthesis_complete', 'agent_output',
         'code_written', 'execution_error', 'escalation_required'].includes(eventType)) return;

    try {
      BlackboardEventRepository.append(
        sessionId,
        eventType,
        payload.author || payload.agentName || 'system',
        payload.content || '',
        payload.metadata || undefined,
      );
    } catch (err) {
      // Silent — persistence is best-effort, never crash the SSE stream
      console.warn('[eventPersister] Failed to persist', eventType, err);
    }
  };

  debugEmitter.on(`debug:${sessionId}`, handler);

  // Store the handler reference for potential cleanup; the SSE handler
  // already cleans up on disconnect, but we keep a weak ref here for safety.
  // The off() call in the SSE close handler will remove this too since
  // it shares the same debug:${sessionId} namespace.
}
