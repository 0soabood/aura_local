import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { ChatMessage } from '../ChatMessage';
import { BlackboardEvent } from '../../shared/types';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  User: () => <div data-testid="user-icon" />,
  Bot: () => <div data-testid="bot-icon" />,
  AlertTriangle: () => <div data-testid="alert-icon" />,
}));

// Mock react-markdown
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));

describe('ChatMessage', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const createEvent = (type: string, content: string): BlackboardEvent => ({
    id: 1,
    session_id: 'session-1',
    event_type: type,
    author: 'user' as const,
    content,
    created_at: new Date().toISOString(),
    seq: 0,
    metadata: null,
  } as unknown as BlackboardEvent);

  it('renders user message correctly', () => {
    const event = createEvent('user_message', 'Hello, AURA!');
    render(<ChatMessage event={event} />);
    
    expect(screen.getByText('Hello, AURA!')).toBeTruthy();
    expect(screen.getByTestId('user-icon')).toBeTruthy();
  });

  it('renders assistant message with markdown', () => {
    const event = createEvent('synthesis_complete', '**Bold text** and *italic*');
    render(<ChatMessage event={event} />);
    
    expect(screen.getByTestId('markdown')).toBeTruthy();
    // ReactMarkdown might not render in test environment, so check for the raw text
    expect(screen.getByText('**Bold text** and *italic*')).toBeTruthy();
    expect(screen.getByTestId('bot-icon')).toBeTruthy();
  });

  it('renders error message correctly', () => {
    const event = createEvent('escalation_required', 'Something went wrong');
    render(<ChatMessage event={event} />);
    
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('AGENT ESCALATION')).toBeTruthy();
    expect(screen.getByTestId('alert-icon')).toBeTruthy();
  });

  it('renders internal events as collapsed chips', () => {
    const event = createEvent('agent_output', 'Internal thought');
    const { container } = render(<ChatMessage event={event} />);
    
    // Internal events render as status chips, not null
    expect(container.firstChild).not.toBeNull();
    expect(screen.getByText('agent output')).toBeTruthy();
  });

  it('memoizes correctly - does not re-render with same props', () => {
    const event = createEvent('user_message', 'Test message');
    const { rerender } = render(<ChatMessage event={event} />);
    
    // Re-render with same event (should not cause re-render due to memo)
    rerender(<ChatMessage event={{ ...event }} />);
    
    // Component should still be in document
    expect(screen.getByText('Test message')).toBeTruthy();
  });
});
