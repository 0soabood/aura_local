import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyDomain } from './supervisors/prompts';
import { SupervisorRouter } from './SupervisorRouter';

// ── Domain classifier ────────────────────────────────────────────────────────

describe('classifyDomain', () => {
  it('classifies code objectives', () => {
    expect(classifyDomain('write a function to parse JSON')).toBe('code');
    expect(classifyDomain('debug the authentication endpoint')).toBe('code');
    expect(classifyDomain('implement a binary search algorithm')).toBe('code');
  });

  it('classifies planning objectives', () => {
    expect(classifyDomain('create a roadmap for Q3')).toBe('planning');
    expect(classifyDomain('break down the migration into tasks')).toBe('planning');
    expect(classifyDomain('prioritize the sprint backlog')).toBe('planning');
  });

  it('classifies research objectives', () => {
    expect(classifyDomain('research competitor pricing trends')).toBe('research');
    expect(classifyDomain('find market intel on DeFi protocols')).toBe('research');
    expect(classifyDomain('analyze trading volume data')).toBe('research');
  });

  it('defaults to research for ambiguous inputs', () => {
    expect(classifyDomain('hello world')).toBe('research');
    expect(classifyDomain('')).toBe('research');
  });

  it('static method on SupervisorRouter delegates to classifyDomain', () => {
    expect(SupervisorRouter.classify('build a CLI tool')).toBe('code');
  });
});

// ── SupervisorRouter.route ────────────────────────────────────────────────────
//
// We mock the ProviderRegistry so no real API calls are made.

vi.mock('./providers/ProviderRegistry', () => {
  return {
    ProviderRegistry: vi.fn().mockImplementation(function () {
      return {
        register: vi.fn().mockReturnThis(),
        call: vi.fn().mockResolvedValue({
          text: JSON.stringify({
            model_sequence: ['gemini:gemini-2.5-flash'],
            reasoning: 'test',
            steps: [
              {
                model: 'gemini:gemini-2.5-flash',
                prompt: 'test prompt',
                expected_output_shape: 'text',
              },
            ],
            blackboard_updates: { test_key: 'test_value' },
            escalation: false,
            escalation_reason: null,
            roi_estimate: 7,
          }),
          model: 'gemini-2.5-flash',
          provider: 'gemini',
          tokensIn: 10,
          tokensOut: 50,
          latencyMs: 100,
        }),
        healthCheck: vi.fn().mockResolvedValue({ gemini: true }),
      };
    }),
  };
});

vi.mock('./Blackboard', () => ({
  Blackboard: vi.fn().mockImplementation(function () {
    return {
      getContext:  vi.fn().mockReturnValue({}),
      publishMany: vi.fn(),
    };
  }),
}));
vi.mock('../db/repositories/SupervisorStatsRepository', () => ({
  SupervisorStatsRepository: { record: vi.fn() },
}));

describe('SupervisorRouter.route', () => {
  let router: SupervisorRouter;

  beforeEach(() => {
    router = new SupervisorRouter();
  });

  it('returns a well-shaped SupervisorResponse', async () => {
    const result = await router.route({
      domain:    'research',
      objective: 'find market trends in DeFi',
      sessionId: 'test-session-1',
    });

    expect(result.supervisor).toBe('Research Supervisor');
    expect(result.domain).toBe('research');
    expect(result.final_response).toBeTruthy();
    expect(Array.isArray(result.steps)).toBe(true);
    expect(result.total_latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('executes all steps and captures results', async () => {
    const result = await router.route({
      domain:    'code',
      objective: 'write a fizzbuzz function',
      sessionId: 'test-session-2',
    });

    expect(result.steps.length).toBeGreaterThan(0);
    result.steps.forEach(step => {
      expect(step.result).toBeDefined();
    });
  });

  it('respects MAX_ESCALATION_DEPTH — does not recurse beyond depth 2', async () => {
    // Force an escalation response from the mock
    const { ProviderRegistry } = await import('./providers/ProviderRegistry');
    const mockInstance = (ProviderRegistry as any).mock.results.at(-1)?.value;
    if (mockInstance) {
      mockInstance.call.mockResolvedValueOnce({
        text: JSON.stringify({
          model_sequence: ['gemini:gemini-2.5-flash'],
          reasoning: 'needs planning help',
          steps: [{ model: 'gemini:gemini-2.5-flash', prompt: 'plan this', expected_output_shape: 'text' }],
          blackboard_updates: {},
          escalation: true,
          escalation_reason: 'cross-domain needed',
          next_supervisor: 'planning',
          roi_estimate: 6,
        }),
        model: 'gemini-2.5-flash', provider: 'gemini', tokensIn: 5, tokensOut: 20, latencyMs: 50,
      });
    }

    // Should not throw even with escalation loop — depth guard kicks in
    const result = await router.route({
      domain:    'research',
      objective: 'coordinate research and planning',
      sessionId: 'test-session-3',
      depth:     2, // already at max
    });

    // depth=2 means escalation is blocked — should return current domain result
    expect(result).toBeDefined();
    expect(result.domain).toBe('research');
  });
});
