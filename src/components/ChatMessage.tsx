import React from 'react';
import ReactMarkdown from 'react-markdown';
import { User, Bot, AlertTriangle, Terminal, Brain, Wrench, CheckCircle, XCircle } from 'lucide-react';
import { BlackboardEvent } from '../shared/types';

interface ChatMessageProps {
  event: BlackboardEvent;
  isStreaming?: boolean;
}

// Event types that represent "internal" agent work (thinking, tool calls)
const INTERNAL_EVENT_TYPES = [
  'agent_output',
  'code_written',
  'thinking',
  'tool_call',
  'tool_result',
  'agent_start',
  'agent_selected',
  'orchestrator',
  'no_bids',
];

export const ChatMessage = React.memo<ChatMessageProps>(({ event, isStreaming }) => {
  const isUser = event.event_type === 'user_message';
  const isError = event.event_type === 'escalation_required';
  const isInternal = INTERNAL_EVENT_TYPES.includes(event.event_type);

  // Collapsed internal events: show as small status chips instead of full bubbles
  if (isInternal && !isStreaming) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        marginBottom: '0.5rem',
        opacity: 0.6,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.25rem 0.75rem',
          borderRadius: '999px',
          border: '1px solid var(--border-1)',
          backgroundColor: 'var(--bg-2)',
          fontSize: '0.7rem',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-2)',
        }}>
          {event.event_type === 'thinking' && <Brain size={12} />}
          {event.event_type === 'tool_call' && <Wrench size={12} />}
          {event.event_type === 'tool_result' && <CheckCircle size={12} />}
          {event.event_type === 'agent_start' && <Terminal size={12} />}
          <span>{event.event_type.replace(/_/g, ' ')}</span>
          {event.author && <span style={{ opacity: 0.7 }}>· {event.author}</span>}
        </div>
      </div>
    );
  }

  // During streaming: render internal events as expanded mini-blocks
  if (isInternal && isStreaming) {
    return (
      <div style={{
        display: 'flex',
        width: '100%',
        marginBottom: '0.75rem',
        justifyContent: 'flex-start',
      }}>
        <div style={{
          display: 'flex',
          maxWidth: '85%',
          flexDirection: 'row',
          opacity: 0.85,
        }}>
          <div style={{
            flexShrink: 0,
            height: '1.5rem',
            width: '1.5rem',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: '0.5rem',
            marginTop: '0.2rem',
            backgroundColor: event.event_type === 'thinking' ? 'var(--chartreuse)' : 'var(--bg-3)',
            color: 'var(--ink)',
          }}>
            {event.event_type === 'thinking' ? <Brain size={12} /> : <Terminal size={12} />}
          </div>
          <div style={{
            padding: '0.5rem 0.75rem',
            borderRadius: '0.375rem',
            border: '1px dashed var(--border-2)',
            backgroundColor: event.event_type === 'thinking' ? 'var(--bg-2)' : 'var(--bg-1)',
            fontSize: '0.75rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-2)',
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            maxHeight: '200px',
            overflowY: 'auto',
          }}>
            {event.content || `${event.event_type}...`}
            {isStreaming && <span style={{ animation: 'blink 1s infinite' }}>▊</span>}
          </div>
        </div>
      </div>
    );
  }

  // Don't render unrecognized internal events
  if (isInternal) return null;

  // User message or final synthesis/error — render as full bubble
  return (
    <div style={{
      display: 'flex',
      width: '100%',
      marginBottom: '1.5rem',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
    }}>
      <div style={{
        display: 'flex',
        maxWidth: '85%',
        flexDirection: isUser ? 'row-reverse' : 'row',
      }}>
        
        {/* Avatar Icon */}
        <div style={{
          flexShrink: 0,
          height: '2rem',
          width: '2rem',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: '0.25rem',
          marginLeft: isUser ? '0.75rem' : '0',
          marginRight: isUser ? '0' : '0.75rem',
          backgroundColor: isUser ? 'var(--ultramarine)' : isError ? 'var(--oxblood)' : 'var(--chartreuse)',
          color: isUser ? 'var(--bone)' : isError ? 'var(--bone)' : 'var(--ink)',
        }}>
          {isUser ? <User size={16} /> : isError ? <AlertTriangle size={16} /> : <Bot size={16} />}
        </div>
        
        {/* Bubble Content */}
        <div style={{
          padding: '1rem 1.25rem',
          borderRadius: '0.5rem',
          border: 'var(--rule-thick)',
          boxShadow: 'var(--shadow-hard)',
          backgroundColor: isUser ? 'var(--ultramarine)' : isError ? 'var(--oxblood)' : 'var(--bone)',
          color: isUser ? 'var(--bone)' : isError ? 'var(--bone)' : 'var(--ink)',
          borderTopRightRadius: isUser ? '0' : '0.5rem',
          borderTopLeftRadius: isUser ? '0.5rem' : '0',
        }}>
          
          {/* Custom markdown styling */}
          <div style={{
            fontSize: '0.875rem',
            lineHeight: 1.6,
          }}>
            {isError ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <span style={{
                  fontWeight: 600,
                  borderBottom: '1px solid rgba(255,255,255,0.3)',
                  paddingBottom: '0.5rem',
                  marginBottom: '0.5rem',
                }}>
                  AGENT ESCALATION
                </span>
                <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{event.content}</code>
              </div>
            ) : (
              <ReactMarkdown>{event.content}</ReactMarkdown>
            )}
          </div>
          
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.event.id === nextProps.event.id &&
    prevProps.event.content === nextProps.event.content &&
    prevProps.event.event_type === nextProps.event.event_type &&
    prevProps.isStreaming === nextProps.isStreaming
  );
});

ChatMessage.displayName = 'ChatMessage';