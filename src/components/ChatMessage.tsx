import React from 'react';
import ReactMarkdown from 'react-markdown';
import { User, Bot, AlertTriangle } from 'lucide-react';
import { BlackboardEvent } from '../shared/types';

export function ChatMessage({ event }: { event: BlackboardEvent }) {
  const isUser = event.event_type === 'user_message';
  const isError = event.event_type === 'escalation_required';

  // We only want to render terminal events to the user, skipping internal system thoughts
  if (!isUser && event.event_type !== 'synthesis_complete' && event.event_type !== 'escalation_required') {
    return null;
  }

  return (
    <div className={`flex w-full mb-6 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[85%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        
        {/* Avatar Icon */}
        <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center mt-1 ${
          isUser ? 'bg-blue-600 ml-3' : isError ? 'bg-red-600 mr-3' : 'bg-green-600 mr-3'
        }`}>
          {isUser ? <User size={16} /> : isError ? <AlertTriangle size={16} /> : <Bot size={16} />}
        </div>
        
        {/* Bubble Content */}
        <div className={`px-5 py-4 rounded-xl shadow-sm ${
          isUser ? 'bg-blue-600 text-white rounded-tr-none' : 
          isError ? 'bg-red-950/50 border border-red-800 text-red-200 rounded-tl-none' : 
          'bg-gray-800 text-gray-200 border border-gray-700 rounded-tl-none'
        }`}>
          
          {/* Custom markdown styling to ensure code blocks and lists look good without typography plugin */}
          <div className="text-sm space-y-4 [&>p]:leading-relaxed [&>pre]:bg-gray-950 [&>pre]:p-4 [&>pre]:rounded-lg [&>pre]:overflow-x-auto [&>pre>code]:text-green-400 [&>code]:bg-gray-900 [&>code]:px-1.5 [&>code]:py-0.5 [&>code]:rounded [&>code]:text-blue-300 [&>ul]:list-disc [&>ul]:pl-5 [&>ol]:list-decimal [&>ol]:pl-5">
            {isError ? (
              <div className="flex flex-col space-y-2">
                <span className="font-semibold text-red-400 border-b border-red-800/50 pb-2 mb-2">
                  Agent Escalation
                </span>
                <code>{event.content}</code>
              </div>
            ) : (
              <ReactMarkdown>{event.content}</ReactMarkdown>
            )}
          </div>
          
        </div>
      </div>
    </div>
  );
}