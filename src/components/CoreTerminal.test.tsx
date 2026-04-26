import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CoreTerminal from '../../src/components/CoreTerminal';

describe('CoreTerminal Resiliency', () => {
  beforeEach(() => {
    // Mock window.aura (getAura() implementation)
    (window as any).aura = {
      getSessionEvents: vi.fn().mockResolvedValue([
        { id: 1, session_id: 's1', event_type: 'agent_output', author: 'agent', content: 'Fallback trace data' }
      ]),
      orchestrate: vi.fn().mockResolvedValue({
        session_id: 's1',
        finalResponse: 'Sanitized response',
        totalLoops: 1
      })
    };
  });

  it('should not crash when orchestrate returns undefined events and should show final response', async () => {
    render(<CoreTerminal />);
    
    const input = screen.getByPlaceholderText('Enter objective...');
    fireEvent.change(input, { target: { value: 'Test message' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    // Assert orchestrate was called
    await waitFor(() => {
      expect((window as any).aura.orchestrate).toHaveBeenCalledWith('Test message', undefined);
    });

    // Assert it gracefully fell back to getSessionEvents since events were omitted
    await waitFor(() => {
      expect((window as any).aura.getSessionEvents).toHaveBeenCalledWith('s1');
    });

    // The finalResponse should be in the main feed
    expect(screen.getByText('Sanitized response')).toBeInTheDocument();
  });
});