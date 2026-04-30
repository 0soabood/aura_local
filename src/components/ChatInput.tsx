import React, { useState } from 'react';
import { messageStore } from './useMessageStore';
import './aura.css';

export function ChatInput() {
  const [text, setText] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    const userMsgId = crypto.randomUUID();
    messageStore.addMessage({ id: userMsgId, role: 'user', content: text });

    const aiMsgId = crypto.randomUUID();
    messageStore.addMessage({ id: aiMsgId, role: 'assistant', content: '', status: 'streaming' });

    setText('');

    try {
      const res = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, stream: true }),
      });

      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep the incomplete chunk in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              // Handle granular format or legacy standard AURA payload 
              if (data.type === 'delta') {
                messageStore.appendContent(aiMsgId, data.content);
              } else if (data.type === 'agent_switch') {
                messageStore.updateMessage(aiMsgId, { agentId: data.agentId });
              } else if (data.type === 'complete') {
                messageStore.updateMessage(aiMsgId, { status: 'complete', metadata: data.metadata });
              } else if (data.text || typeof data === 'string') {
                messageStore.appendContent(aiMsgId, data.text || data);
              }
            } catch (err) { /* silent skip for malformed stream chunk */ }
          }
        }
      }
      messageStore.updateMessage(aiMsgId, { status: 'complete' });
    } catch (err) {
      messageStore.updateMessage(aiMsgId, { status: 'error', content: `\n\n**Error:** ${String(err)}` });
    }
  };

  return (
    <form className="chat-input-form" onSubmit={handleSubmit}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Message AURA..."
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
        }}
      />
      <button type="submit">SEND</button>
    </form>
  );
}