import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReactiveOrchestrator } from './ReactiveOrchestrator';
import { BlackboardEventRepository } from '../db/repositories/BlackboardEventRepository';
import { ProviderRegistry } from './providers/ProviderRegistry';

// Isolated session IDs so parallel test runs don't collide in-memory DB.
let sessionCounter = 0;
function nextSession(): string {
  return `test-session-${++sessionCounter}`;
}

function agentCallMock(eventType: string, content: string) {
  return vi.fn().mockResolvedValue({ event_type: eventType, content, metadata: {} });
}

describe('ReactiveOrchestrator', () => {
  let orchestrator: ReactiveOrchestrator;

  beforeEach(() => {
    orchestrator = new ReactiveOrchestrator();
    // Silence console output from orchestrator and agents
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('terminates with synthesis_complete on normal path', async () => {
    const agents = (orchestrator as any).agents;
    // Research agent bids once, produces output, then abstains so synthesis can close out
    vi.spyOn(agents[0], 'evaluate')
      .mockReturnValueOnce({ agentName: 'research_agent', confidence: 0.85, proposedAction: 'research', expectedOutputShape: 'text' })
      .mockReturnValue({ agentName: 'research_agent', confidence: 0, proposedAction: 'done', expectedOutputShape: 'text' });
    vi.spyOn(agents[0], 'execute').mockResolvedValue({ event_type: 'agent_output', content: 'Research complete', metadata: {} });
    // Synthesis agent wins on second loop (synthesis guard allows when specialist output exists and no specialist is competing)
    vi.spyOn(agents[2], 'evaluate')
      .mockReturnValueOnce({ agentName: 'synthesis_agent', confidence: 0, proposedAction: 'wait', expectedOutputShape: 'text' })
      .mockReturnValue({ agentName: 'synthesis_agent', confidence: 0.90, proposedAction: 'synthesize', expectedOutputShape: 'text' });
    vi.spyOn(agents[2], 'execute').mockResolvedValue({ event_type: 'synthesis_complete', content: 'Final answer', metadata: {} });
    // Code agent abstains
    vi.spyOn(agents[1], 'evaluate').mockReturnValue({ agentName: 'code_agent', confidence: 0, proposedAction: 'abstain', expectedOutputShape: 'code' });

    const result = await orchestrator.run({ sessionId: nextSession(), message: 'research AI trends' });
    expect(result.terminationReason).toBe('synthesis_complete');
    expect(result.finalResponse).toBe('Final answer');
    expect(result.totalLoops).toBeGreaterThanOrEqual(1);
  });

  it('terminates with max_loops when no agent produces a terminal event', async () => {
    const agents = (orchestrator as any).agents;
    // Research agent keeps winning without terminating
    vi.spyOn(agents[0], 'evaluate').mockReturnValue({ agentName: 'research_agent', confidence: 0.85, proposedAction: 'keep going', expectedOutputShape: 'text' });
    vi.spyOn(agents[0], 'execute').mockResolvedValue({ event_type: 'agent_output', content: 'More research', metadata: {} });
    vi.spyOn(agents[1], 'evaluate').mockReturnValue({ agentName: 'code_agent', confidence: 0, proposedAction: 'abstain', expectedOutputShape: 'code' });
    vi.spyOn(agents[2], 'evaluate').mockReturnValue({ agentName: 'synthesis_agent', confidence: 0, proposedAction: 'abstain', expectedOutputShape: 'text' });

    const result = await orchestrator.run({ sessionId: nextSession(), message: 'research this forever' });
    expect(result.terminationReason).toBe('max_loops');
    expect(result.totalLoops).toBe(6);
  });

  it('terminates with escalation_required when agent emits that event', async () => {
    const agents = (orchestrator as any).agents;
    vi.spyOn(agents[0], 'evaluate').mockReturnValue({ agentName: 'research_agent', confidence: 0.85, proposedAction: 'research', expectedOutputShape: 'text' });
    vi.spyOn(agents[0], 'execute').mockResolvedValue({ event_type: 'escalation_required', content: JSON.stringify({ reason: 'Cannot complete task' }), metadata: {} });
    vi.spyOn(agents[1], 'evaluate').mockReturnValue({ agentName: 'code_agent', confidence: 0, proposedAction: 'abstain', expectedOutputShape: 'code' });
    vi.spyOn(agents[2], 'evaluate').mockReturnValue({ agentName: 'synthesis_agent', confidence: 0, proposedAction: 'abstain', expectedOutputShape: 'text' });

    const result = await orchestrator.run({ sessionId: nextSession(), message: 'research something impossible' });
    expect(result.terminationReason).toBe('escalation_required');
  });

  it('appends execution_error and does not crash when agent execute() throws', async () => {
    const agents = (orchestrator as any).agents;
    // All agents keep returning non-terminal output (research throws every loop)
    vi.spyOn(agents[0], 'evaluate').mockReturnValue({ agentName: 'research_agent', confidence: 0.85, proposedAction: 'research', expectedOutputShape: 'text' });
    vi.spyOn(agents[0], 'execute').mockRejectedValue(new Error('Network timeout'));
    vi.spyOn(agents[1], 'evaluate').mockReturnValue({ agentName: 'code_agent', confidence: 0, proposedAction: 'abstain', expectedOutputShape: 'code' });
    vi.spyOn(agents[2], 'evaluate').mockReturnValue({ agentName: 'synthesis_agent', confidence: 0, proposedAction: 'abstain', expectedOutputShape: 'text' });

    const sessionId = nextSession();
    const result = await orchestrator.run({ sessionId, message: 'research with error' });

    const events = BlackboardEventRepository.findBySession(sessionId);
    expect(events.some(e => e.event_type === 'execution_error')).toBe(true);
    // Orchestrator should survive and exhaust max loops rather than throwing
    expect(result.terminationReason).toBe('max_loops');
    expect(result.totalLoops).toBe(6);
  });

  it('onProgress callback exceptions do not crash the orchestrator', async () => {
    const agents = (orchestrator as any).agents;
    vi.spyOn(agents[2], 'evaluate').mockReturnValue({ agentName: 'synthesis_agent', confidence: 0.40, proposedAction: 'chat', expectedOutputShape: 'text' });
    vi.spyOn(agents[2], 'execute').mockResolvedValue({ event_type: 'synthesis_complete', content: 'Done', metadata: {} });
    vi.spyOn(agents[0], 'evaluate').mockReturnValue({ agentName: 'research_agent', confidence: 0, proposedAction: 'abstain', expectedOutputShape: 'text' });
    vi.spyOn(agents[1], 'evaluate').mockReturnValue({ agentName: 'code_agent', confidence: 0, proposedAction: 'abstain', expectedOutputShape: 'code' });

    const throwingProgress = vi.fn().mockImplementation(() => { throw new Error('callback error'); });

    // Should not throw even when onProgress throws
    const result = await orchestrator.run({ sessionId: nextSession(), message: 'hello', onProgress: throwingProgress });
    expect(result.terminationReason).toBe('synthesis_complete');
  });

  it('extractFinalResponse strips [agent_name]: prefix from terminal content', () => {
    const extract = (orchestrator as any).extractFinalResponse.bind(orchestrator);
    const events = [
      { id: 1, session_id: 's1', seq: 1, event_type: 'user_message', author: 'user', content: 'write code', metadata: null, created_at: '' },
      { id: 2, session_id: 's1', seq: 2, event_type: 'synthesis_complete', author: 'synthesis_agent', content: '[code_agent]:\n```js\nconsole.log("hi");\n```', metadata: null, created_at: '' },
    ];
    const response = extract(events);
    expect(response).not.toContain('[code_agent]:');
    expect(response).toContain('console.log');
  });

  it('extractFinalResponse falls back to last specialist output when no terminal event', () => {
    const extract = (orchestrator as any).extractFinalResponse.bind(orchestrator);
    const events = [
      { id: 1, session_id: 's1', seq: 1, event_type: 'user_message', author: 'user', content: 'write code', metadata: null, created_at: '' },
      { id: 2, session_id: 's1', seq: 2, event_type: 'code_written', author: 'code_agent', content: 'const x = 1;', metadata: null, created_at: '' },
    ];
    expect(extract(events)).toBe('const x = 1;');
  });

  it('extractFinalResponse returns safe fallback when no useful event exists', () => {
    const extract = (orchestrator as any).extractFinalResponse.bind(orchestrator);
    const events = [
      { id: 1, session_id: 's1', seq: 1, event_type: 'user_message', author: 'user', content: 'something', metadata: null, created_at: '' },
    ];
    expect(extract(events)).toBe('No final response generated.');
  });
});
