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
    <div className="flex flex-col h-full relative bg-gray-900">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {(!events || events.length === 0) ? (
          <div className="h-full flex items-center justify-center text-gray-500 flex-col space-y-4">
            <div className="w-16 h-16 bg-gray-800 rounded-2xl flex items-center justify-center shadow-lg border border-gray-700">
              <span className="text-2xl">✨</span>
            </div>
            <p>Send a message to start a local session.</p>
          </div>
        ) : (
          (events || []).map((ev) => <ChatMessage key={ev.id} event={ev} />)
        )}
        
        {/* Active Agent Status Indicator */}
        {isStreaming && (
          <div className="flex items-center text-gray-400 space-x-3 ml-[3.25rem] mt-2 mb-6">
            <Loader2 className="animate-spin" size={16} />
            <span className="text-sm font-medium tracking-wide text-blue-400">
              {activeAgent ? `[${activeAgent}] executing...` : 'Thinking...'}
            </span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-6 bg-gray-900 border-t border-gray-800">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto relative flex items-center shadow-lg rounded-xl overflow-hidden">
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask AURA..." disabled={isStreaming} className="w-full bg-gray-800 border border-gray-700 text-white pl-5 pr-14 py-4 focus:outline-none focus:border-blue-500 disabled:opacity-50 transition-colors" />
          <button type="submit" disabled={!input.trim() || isStreaming} className="absolute right-3 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 transition-colors">
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}