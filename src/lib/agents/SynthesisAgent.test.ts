import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SynthesisAgent } from './SynthesisAgent';
import { ProviderRegistry } from '../providers/ProviderRegistry';
import type { BlackboardEvent, AgentBid } from '../../shared/types';

function evt(overrides: Partial<BlackboardEvent> & Pick<BlackboardEvent, 'event_type' | 'author' | 'content'>): BlackboardEvent {
  return { id: 1, session_id: 's1', seq: 1, metadata: null, created_at: '', ...overrides };
}

const BID: AgentBid = { agentName: 'synthesis_agent', confidence: 0.90, proposedAction: 'test', expectedOutputShape: 'text' };

describe('SynthesisAgent', () => {
  let registry: ProviderRegistry;
  let agent: SynthesisAgent;

  beforeEach(() => {
    registry = new ProviderRegistry();
    agent = new SynthesisAgent(registry);
    // Make groq available so SYNTHESIS_MODELS finds groq:llama-3.1-8b-instant
    vi.spyOn(registry, 'listProviders').mockReturnValue(['groq']);
  });

  describe('evaluate()', () => {
    it('returns 0.90 when specialist output exists and last event is agent_output', () => {
      const events: BlackboardEvent[] = [
        evt({ event_type: 'user_message', author: 'user', content: 'explain recursion' }),
        evt({ id: 2, seq: 2, event_type: 'agent_output', author: 'research_agent', content: 'Recursion is...' }),
      ];
      expect(agent.evaluate(events).confidence).toBe(0.90);
    });

    it('returns 0.40 for conversational fallback when only user_message exists', () => {
      const events: BlackboardEvent[] = [
        evt({ event_type: 'user_message', author: 'user', content: 'hello' }),
      ];
      expect(agent.evaluate(events).confidence).toBe(0.40);
    });

    it('returns 0 when no healthy provider is available', () => {
      vi.spyOn(registry, 'listProviders').mockReturnValue([]);
      const events: BlackboardEvent[] = [
        evt({ event_type: 'user_message', author: 'user', content: 'hello' }),
      ];
      expect(agent.evaluate(events).confidence).toBe(0);
    });

    it('returns 0 when last event is already synthesis_complete', () => {
      const events: BlackboardEvent[] = [
        evt({ event_type: 'user_message', author: 'user', content: 'hello' }),
        evt({ id: 2, seq: 2, event_type: 'synthesis_complete', author: 'synthesis_agent', content: 'Done' }),
      ];
      expect(agent.evaluate(events).confidence).toBe(0);
    });
  });

  describe('execute()', () => {
    it('returns synthesis_complete event with model text', async () => {
      vi.spyOn(registry, 'call').mockResolvedValue({
        text: 'Final synthesized answer',
        model: 'llama-3.1-8b-instant',
        provider: 'groq',
        latencyMs: 120,
        rateLimited: false,
      } as any);

      const events: BlackboardEvent[] = [
        evt({ event_type: 'user_message', author: 'user', content: 'explain trees' }),
      ];
      const result = await agent.execute(events, BID);
      expect(result.event_type).toBe('synthesis_complete');
      expect(result.content).toBe('Final synthesized answer');
    });

    it('returns escalation_required when provider is rate-limited', async () => {
      vi.spyOn(registry, 'call').mockResolvedValue({
        text: '',
        model: 'llama-3.1-8b-instant',
        provider: 'groq',
        latencyMs: 50,
        rateLimited: true,
        errorMessage: 'Rate limit exceeded',
        retryAfterSeconds: 30,
      } as any);

      const events: BlackboardEvent[] = [
        evt({ event_type: 'user_message', author: 'user', content: 'hello' }),
      ];
      const result = await agent.execute(events, BID);
      expect(result.event_type).toBe('escalation_required');
    });

    it('throws when no healthy provider is available during execution', async () => {
      vi.spyOn(registry, 'listProviders').mockReturnValue([]);
      const events: BlackboardEvent[] = [
        evt({ event_type: 'user_message', author: 'user', content: 'hello' }),
      ];
      await expect(agent.execute(events, BID)).rejects.toThrow('No healthy synthesis provider');
    });
  });
});
