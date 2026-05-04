import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { useChatStream } from './useChatStream';
import { ChatMessage } from './ChatMessage';

export function ChatPage() {
  const { events, isStreaming, activeAgent, sendMessage } = useChatStream();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom whenever new messages arrive or agent status changes
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => {
    scrollToBottom();
  }, [events, isStreaming, activeAgent]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    sendMessage(input);
    setInput('');
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      position: 'relative',
      backgroundColor: 'var(--ink)',
    }}>
      {/* Messages Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
        {(!events || events.length === 0) ? (
          <div style={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: '1rem',
            color: 'var(--bone)',
            opacity: 0.6,
          }}>
            <div style={{
              width: '4rem',
              height: '4rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-hard)',
              backgroundColor: 'var(--ink)',
              opacity: 0.8,
              border: 'var(--rule-thick)',
              borderRadius: '1rem',
            }}>
              <span style={{ fontSize: '1.5rem' }}>✨</span>
            </div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>SEND A MESSAGE TO START A LOCAL SESSION.</p>
          </div>
        ) : (
          (events || []).map((ev) => <ChatMessage key={ev.id} event={ev} />)
        )}

        {/* Active Agent Status Indicator */}
        {isStreaming && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginLeft: '3.25rem',
            marginTop: '0.5rem',
            marginBottom: '1.5rem',
            color: 'var(--chartreuse)',
          }}>
            <Loader2 className="animate-spin" size={16} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.1em' }}>
              {activeAgent ? `[${activeAgent}] EXECUTING...` : 'THINKING...'}
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div style={{
        padding: '1.5rem',
        backgroundColor: 'var(--ink)',
        borderTop: 'var(--rule-thick)',
      }}>
        <form onSubmit={handleSubmit} style={{
          maxWidth: '56rem',
          margin: '0 auto',
          width: '100%',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          boxShadow: 'var(--shadow-hard)',
        }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="ASK AURA..."
            disabled={isStreaming}
            style={{
              width: '100%',
              backgroundColor: 'var(--bone)',
              color: 'var(--ink)',
              paddingLeft: '1.25rem',
              paddingRight: '3.5rem',
              paddingTop: '1rem',
              paddingBottom: '1rem',
              border: 'var(--rule-thick)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.875rem',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            style={{
              position: 'absolute',
              right: '0.75rem',
              padding: '0.5rem',
              backgroundColor: 'var(--oxblood)',
              color: 'var(--bone)',
              border: 'var(--rule-thick)',
              cursor: !input.trim() || isStreaming ? 'not-allowed' : 'pointer',
              opacity: !input.trim() || isStreaming ? 0.5 : 1,
            }}
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}