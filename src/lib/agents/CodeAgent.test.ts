import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CodeAgent } from './CodeAgent';
import { ProviderRegistry } from '../providers/ProviderRegistry';
import type { BlackboardEvent, AgentBid } from '../../shared/types';

function evt(overrides: Partial<BlackboardEvent> & Pick<BlackboardEvent, 'event_type' | 'author' | 'content'>): BlackboardEvent {
  return { id: 1, session_id: 's1', seq: 1, metadata: null, created_at: '', ...overrides };
}

const BID: AgentBid = { agentName: 'code_agent', confidence: 0.85, proposedAction: 'generate code', expectedOutputShape: 'code' };

describe('CodeAgent', () => {
  let registry: ProviderRegistry;
  let agent: CodeAgent;

  beforeEach(() => {
    registry = new ProviderRegistry();
    agent = new CodeAgent(registry);
    // groq is in CODE_MODELS as 'groq:llama-3.3-70b-versatile'
    vi.spyOn(registry, 'listProviders').mockReturnValue(['groq']);
  });

  describe('evaluate()', () => {
    it('returns 0.85 when code keywords detected and agent has not yet run', () => {
      const events: BlackboardEvent[] = [
        evt({ event_type: 'user_message', author: 'user', content: 'write a function to sort an array' }),
      ];
      expect(agent.evaluate(events).confidence).toBe(0.85);
    });

    it('returns 0 for non-code query', () => {
      const events: BlackboardEvent[] = [
        evt({ event_type: 'user_message', author: 'user', content: 'tell me about history' }),
      ];
      expect(agent.evaluate(events).confidence).toBe(0);
    });

    it('returns 0 when last event is a dead-path error (ENOENT)', () => {
      const deadPathError = JSON.stringify({ agent: 'code_agent', error: 'ENOENT: no such file or directory', loop: 1, bid: {} });
      const events: BlackboardEvent[] = [
        evt({ event_type: 'user_message', author: 'user', content: 'fix the bug in my code' }),
        evt({ id: 2, seq: 2, event_type: 'execution_error', author: 'orchestrator', content: deadPathError }),
      ];
      expect(agent.evaluate(events).confidence).toBe(0);
    });

    it('returns 0 when no healthy provider is available', () => {
      vi.spyOn(registry, 'listProviders').mockReturnValue([]);
      const events: BlackboardEvent[] = [
        evt({ event_type: 'user_message', author: 'user', content: 'implement a binary search function' }),
      ];
      expect(agent.evaluate(events).confidence).toBe(0);
    });
  });

  describe('execute()', () => {
    it('returns code_written event when model responds with text and no tool calls', async () => {
      vi.spyOn(registry, 'call').mockResolvedValue({
        text: '```typescript\nfunction sort(arr: number[]) { return arr.sort(); }\n```',
        model: 'llama-3.3-70b-versatile',
        provider: 'groq',
        latencyMs: 350,
        rateLimited: false,
        toolCalls: [],
      } as any);

      const events: BlackboardEvent[] = [
        evt({ event_type: 'user_message', author: 'user', content: 'write a sort function' }),
      ];
      const result = await agent.execute(events, BID);
      expect(result.event_type).toBe('code_written');
      expect(result.content).toContain('function sort');
    });

    it('returns code_context_retrieved when model calls a context tool', async () => {
      vi.spyOn(registry, 'call').mockResolvedValue({
        text: '',
        model: 'llama-3.3-70b-versatile',
        provider: 'groq',
        latencyMs: 150,
        rateLimited: false,
        toolCalls: [{
          id: 'tc1',
          function: { name: 'search_codebase', arguments: JSON.stringify({ query: 'sort function' }) },
        }],
      } as any);

      // Mock the ContextTools module
      const contextTools = await import('../context/ContextTools');
      vi.spyOn(contextTools, 'executeContextTool').mockResolvedValue('Found: src/utils/sort.ts');

      const events: BlackboardEvent[] = [
        evt({ event_type: 'user_message', author: 'user', content: 'find the sort function in the codebase' }),
      ];
      const result = await agent.execute(events, BID);
      expect(result.event_type).toBe('code_context_retrieved');
      expect(result.content).toContain('Found: src/utils/sort.ts');
    });

    it('throws when context tool execution returns an error', async () => {
      vi.spyOn(registry, 'call').mockResolvedValue({
        text: '',
        model: 'llama-3.3-70b-versatile',
        provider: 'groq',
        latencyMs: 100,
        rateLimited: false,
        toolCalls: [{
          id: 'tc1',
          function: { name: 'get_file_skeleton', arguments: JSON.stringify({ path: 'nonexistent.ts' }) },
        }],
      } as any);

      const contextTools = await import('../context/ContextTools');
      vi.spyOn(contextTools, 'executeContextTool').mockResolvedValue('Error: ENOENT no such file');

      const events: BlackboardEvent[] = [
        evt({ event_type: 'user_message', author: 'user', content: 'read nonexistent.ts' }),
      ];
      await expect(agent.execute(events, BID)).rejects.toThrow('Error: ENOENT');
    });
  });
});
