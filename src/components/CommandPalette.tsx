import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useClearChat } from '../stores/useAura';

interface Command {
  id: string;
  label: string;
  description: string;
  icon: string;
  prefix: string;       // what to insert into the input
  action?: 'fill' | 'trigger' | 'clear';
}

const COMMANDS: Command[] = [
  {
    id: 'research',
    label: '/research',
    description: 'Research a topic — gathers information from local files',
    icon: '🔍',
    prefix: 'Research: ',
    action: 'fill',
  },
  {
    id: 'code',
    label: '/code',
    description: 'Write or debug code for a specific task',
    icon: '⌨️',
    prefix: 'Write code to: ',
    action: 'fill',
  },
  {
    id: 'document',
    label: '/document',
    description: 'Generate a document (LEA letter, business plan, pitch deck)',
    icon: '📝',
    prefix: 'Handle admin: ',
    action: 'fill',
  },
  {
    id: 'plan',
    label: '/plan',
    description: 'Decompose a complex goal into an execution plan',
    icon: '📋',
    prefix: 'Plan and decompose: ',
    action: 'fill',
  },
  {
    id: 'clear',
    label: '/clear',
    description: 'Clear the current conversation',
    icon: '🗑️',
    prefix: '',
    action: 'clear',
  },
  {
    id: 'help',
    label: '/help',
    description: 'Show available commands and usage tips',
    icon: '❓',
    prefix: 'Help: ',
    action: 'fill',
  },
];

interface CommandPaletteProps {
  /** The current input text after the slash (e.g. "rese" for "/rese...") */
  query: string;
  /** Whether the palette is visible */
  visible: boolean;
  /** Called when user selects a command */
  onSelect: (command: Command) => void;
  /** Called to close the palette */
  onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  query,
  visible,
  onSelect,
  onClose,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = query
    ? COMMANDS.filter(c => c.id.includes(query.toLowerCase()))
    : COMMANDS;

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.children[selectedIndex] as HTMLElement;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!visible) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[selectedIndex]) {
          onSelect(filtered[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [visible, filtered, selectedIndex, onSelect, onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!visible) return null;

  return (
    <div className="absolute bottom-full left-3 right-3 mb-1 z-40">
      <div className="bg-[#0d0d1a] border border-white/10 rounded-xl shadow-2xl shadow-black/50 overflow-hidden backdrop-blur-xl">
        {/* Header */}
        <div className="px-3 py-1.5 border-b border-white/[0.04]">
          <span className="text-[9px] font-mono text-white/20">Commands  ·  ↑↓ navigate  ·  Enter select  ·  Esc close</span>
        </div>

        {/* Command list */}
        <div ref={listRef} className="max-h-56 overflow-y-auto py-1" role="listbox">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-[11px] font-mono text-white/20">
              No matching commands
            </div>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                role="option"
                aria-selected={i === selectedIndex}
                onClick={() => onSelect(cmd)}
                onMouseEnter={() => setSelectedIndex(i)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-all ${
                  i === selectedIndex
                    ? 'bg-indigo-500/15 text-white'
                    : 'text-white/60 hover:bg-white/[0.02] hover:text-white/80'
                }`}
              >
                <span className="text-[13px] leading-none shrink-0">{cmd.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className={`text-[12px] font-medium font-mono ${i === selectedIndex ? 'text-indigo-300' : 'text-white/70'}`}>
                    {cmd.label}
                  </div>
                  <div className="text-[10px] text-white/30 truncate mt-0.5">
                    {cmd.description}
                  </div>
                </div>
                {cmd.action && (
                  <span className="text-[8px] font-mono text-white/15 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.04]">
                    {cmd.action === 'clear' ? '⚡' : '⏎'}
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer tip */}
        <div className="px-3 py-1.5 border-t border-white/[0.04]">
          <span className="text-[8px] font-mono text-white/15">
            Type <span className="text-indigo-400/60">/command</span> to filter · Commands auto-fill the input
          </span>
        </div>
      </div>
    </div>
  );
};

export { COMMANDS };
export type { Command };
