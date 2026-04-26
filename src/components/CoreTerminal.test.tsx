import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CoreTerminal from '../../src/components/CoreTerminal';

describe('CoreTerminal Resiliency (SSE Streaming)', () => {
  let streamMock: any;

  beforeEach(() => {
    streamMock = vi.fn();
    // Mock window.aura (getAura() implementation)
    (window as any).aura = {
      getSessionEvents: vi.fn().mockResolvedValue([
        { id: 1, session_id: 's1', event_type: 'agent_output', author: 'agent', content: 'Fallback trace data' }
      ]),
      streamOrchestrate: streamMock,
    };
  });

  it('final answer arrives exactly once via done', async () => {
    streamMock.mockImplementation(async (payload: any, onEvent: any) => {
      onEvent('done', {
        sessionId: 's1',
        finalResponse: 'Single stream response',
        totalLoops: 1,
        totalLatencyMs: 150,
        terminationReason: 'synthesis_complete',
        events: []
      });
    });

    render(<CoreTerminal />);
    
    const input = screen.getByPlaceholderText('Enter objective...');
    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('Single stream response')).toBeInTheDocument();
    });

    // Ensure it only renders one assistant response
    const responses = screen.getAllByText('Single stream response');
    expect(responses.length).toBe(1);
  });

  it('user message is never echoed as the final answer', async () => {
    streamMock.mockImplementation(async (payload: any, onEvent: any) => {
      // Emulate backend safe fallback behavior when looping maxes out
      onEvent('done', {
        sessionId: 's1',
        finalResponse: 'No final response generated.',
        totalLoops: 6,
        terminationReason: 'max_loops'
      });
    });

    render(<CoreTerminal />);
    const input = screen.getByPlaceholderText('Enter objective...');
    fireEvent.change(input, { target: { value: 'Echo test' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('No final response generated.')).toBeInTheDocument();
    });

    // The user message should only appear as the user bubble, not the assistant response
    const userBubbles = screen.getAllByText('Echo test');
    expect(userBubbles.length).toBe(1);
  });

  it('error event renders a user-visible failure state', async () => {
    streamMock.mockImplementation(async (payload: any, onEvent: any) => {
      onEvent('error', { message: 'Agent research_agent encountered an error: API timeout' });
    });

    render(<CoreTerminal />);
    const input = screen.getByPlaceholderText('Enter objective...');
    fireEvent.change(input, { target: { value: 'Break it' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('Agent research_agent encountered an error: API timeout')).toBeInTheDocument();
      expect(screen.getByText('ERROR')).toBeInTheDocument(); // checks the status line
    });
  });
});