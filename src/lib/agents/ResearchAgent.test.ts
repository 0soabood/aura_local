import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResearchAgent } from './ResearchAgent';
import { ProviderRegistry } from '../providers/ProviderRegistry';
import type { BlackboardEvent, AgentBid } from '../../shared/types';

function evt(overrides: Partial<BlackboardEvent> & Pick<BlackboardEvent, 'event_type' | 'author' | 'content'>): BlackboardEvent {
  return { id: 1, session_id: 's1', seq: 1, metadata: null, created_at: '', ...overrides };
}

const BID: AgentBid = { agentName: 'research_agent', confidence: 0.85, proposedAction: 'research', expectedOutputShape: 'text' };

describe('ResearchAgent', () => {
  let registry: ProviderRegistry;
  let agent: ResearchAgent;

  beforeEach(() => {
    registry = new ProviderRegistry();
    agent = new ResearchAgent(registry);
    // vertex is the primary provider for 'long_context'
    vi.spyOn(registry, 'getAvailableProviders').mockReturnValue([{ id: 'vertex' } as any]);
  });

  describe('evaluate()', () => {
    it('returns 0.85 when research keywords detected and agent has not yet run', () => {
      const events: BlackboardEvent[] = [
        evt({ event_type: 'user_message', author: 'user', content: 'research the latest AI trends' }),
      ];
      expect(agent.evaluate(events).confidence).toBe(0.85);
    });

    it('returns 0 for non-research query', () => {
      const events: BlackboardEvent[] = [
        evt({ event_type: 'user_message', author: 'user', content: 'hello there' }),
      ];
      expect(agent.evaluate(events).confidence).toBe(0);
    });

    it('returns 0 when research_agent has already produced output', () => {
      const events: BlackboardEvent[] = [
        evt({ event_type: 'user_message', author: 'user', content: 'research AI market trends' }),
        evt({ id: 2, seq: 2, event_type: 'agent_output', author: 'research_agent', content: 'AI market is growing...' }),
      ];
      expect(agent.evaluate(events).confidence).toBe(0);
    });

    it('returns 0 when primary provider is unavailable', () => {
      vi.spyOn(registry, 'getAvailableProviders').mockReturnValue([]);
      const events: BlackboardEvent[] = [
        evt({ event_type: 'user_message', author: 'user', content: 'research AI trends' }),
      ];
      expect(agent.evaluate(events).confidence).toBe(0);
    });
  });

  describe('execute()', () => {
    it('returns agent_output with text when no executed_tools present', async () => {
      vi.spyOn(registry, 'call').mockResolvedValue({
        text: 'Here is the research result',
        model: 'gemini-2.5-pro',
        provider: 'vertex',
        latencyMs: 200,
        rateLimited: false,
      } as any);

      const events: BlackboardEvent[] = [
        evt({ event_type: 'user_message', author: 'user', content: 'research AI trends' }),
      ];
      const result = await agent.execute(events, BID);
      expect(result.event_type).toBe('agent_output');
      expect(result.content).toBe('Here is the research result');
    });

    it('returns agent_output with provider text (executed_tools no longer surfaced)', async () => {
      vi.spyOn(registry, 'call').mockResolvedValue({
        text: 'Research findings on the AI market.',
        model: 'gemini-2.5-pro',
        provider: 'vertex',
        latencyMs: 300,
        rateLimited: false,
        // executed_tools was a Groq-specific field; runReactLoop no longer surfaces it.
        executed_tools: [{ name: 'web_search', result: 'some result' }],
        toolCalls: [],
      } as any);

      const events: BlackboardEvent[] = [
        evt({ event_type: 'user_message', author: 'user', content: 'find AI market data' }),
      ];
      const result = await agent.execute(events, BID);
      expect(result.event_type).toBe('agent_output');
      expect(result.content).toContain('Research findings');
    });
  });
});
