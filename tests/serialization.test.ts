import request from 'supertest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApiApp } from '../src/main/app';
import { ReactiveOrchestrator } from '../src/lib/ReactiveOrchestrator';
import { BlackboardEventRepository } from '../src/db/repositories/BlackboardEventRepository';

const app = createApiApp();

describe('Response Serialization & Finalization Boundaries (Integration)', () => {
  let runSpy: any;
  let findBySessionSpy: any;

  beforeEach(() => {
    // Intercept exactly at the application boundaries without requiring full DB or LLM mocks
    runSpy = vi.spyOn(ReactiveOrchestrator.prototype, 'run');
    findBySessionSpy = vi.spyOn(BlackboardEventRepository, 'findBySession');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /api/orchestrate', () => {
    it('should return sanitized response shape without events by default', async () => {
      runSpy.mockResolvedValue({
        sessionId: 'test-session',
        finalResponse: 'Sanitized answer',
        terminationReason: 'synthesis_complete',
        totalLoops: 2,
        totalLatencyMs: 800,
        events: [{ event_type: 'user_message', content: 'test input' }]
      });

      const response = await request(app)
        .post('/api/orchestrate')
        .send({ sessionId: 'test-session', message: 'test input' });
        
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('finalResponse', 'Sanitized answer');
      expect(response.body).toHaveProperty('totalLoops', 2);
      expect(response.body).not.toHaveProperty('events');
    });

    it('should ensure internal events are not exposed by default even when orchestrator.run returns a large trace', async () => {
      runSpy.mockResolvedValue({
        sessionId: 'test-session-regression',
        finalResponse: 'Safe answer',
        terminationReason: 'synthesis_complete',
        totalLoops: 3,
        totalLatencyMs: 1200,
        events: [
          { event_type: 'user_message', content: 'hello' },
          { event_type: 'agent_output', content: 'secret internal thought process' }
        ]
      });

      const response = await request(app)
        .post('/api/orchestrate')
        .send({ sessionId: 'test-session-regression', message: 'hello' });
        
      expect(response.status).toBe(200);
      expect(response.body.events).toBeUndefined();
      expect(response.body.finalResponse).toBe('Safe answer');
    });

    it('should include events if debug flag is true', async () => {
      runSpy.mockResolvedValue({
        sessionId: 'test-session',
        finalResponse: 'Sanitized answer',
        terminationReason: 'synthesis_complete',
        totalLoops: 2,
        totalLatencyMs: 800,
        events: [{ event_type: 'user_message', content: 'test input' }]
      });

      const response = await request(app)
        .post('/api/orchestrate')
        .send({ sessionId: 'test-session', message: 'test input', debug: true });
        
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('events');
      expect(response.body.events.length).toBe(1);
    });
  });

  describe('POST /api/supervisor/route', () => {
    it('populates final_response from terminal state', async () => {
      findBySessionSpy.mockReturnValue([
        { event_type: 'user_message', content: 'hello' },
        { event_type: 'synthesis_complete', content: 'Terminal answer' }
      ]);

      const response = await request(app)
        .post('/api/supervisor/route')
        .send({ sessionId: 'resolved-session' });
        
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('final_response', 'Terminal answer');
    });

    it('populates final_response from structured resolved state', async () => {
      findBySessionSpy.mockReturnValue([
        { event_type: 'user_message', content: 'hello' },
        { event_type: 'blackboard_update', content: 'AURA-BEACON-441', metadata: { resolved: true } }
      ]);

      const response = await request(app)
        .post('/api/supervisor/route')
        .send({ sessionId: 'beacon-session' });
        
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('final_response', 'AURA-BEACON-441');
    });
  });

  describe('Final Response Extraction & Shaping', () => {
    it('must not contain [code_agent]: in the finalResponse', () => {
      const orchestrator = new ReactiveOrchestrator();
      const events: any[] = [
        { id: 1, session_id: 's1', seq: 1, event_type: 'user_message', author: 'user', content: 'write code' },
        { id: 2, session_id: 's1', seq: 2, event_type: 'synthesis_complete', author: 'synthesis_agent', content: '[code_agent]:\n```python\nprint("hello")\n```' }
      ];
      const finalResponse = (orchestrator as any).extractFinalResponse(events);
      expect(finalResponse).not.toContain('[code_agent]:');
      expect(finalResponse).toContain('print("hello")');
    });

    it('must not contain [research_agent]: in the finalResponse', () => {
      const orchestrator = new ReactiveOrchestrator();
      const events: any[] = [
        { id: 1, session_id: 's1', seq: 1, event_type: 'user_message', author: 'user', content: 'research topics' },
        { id: 2, session_id: 's1', seq: 2, event_type: 'synthesis_complete', author: 'synthesis_agent', content: 'Here is the info:\n[research_agent]:\nThe history of Rome...' }
      ];
      const finalResponse = (orchestrator as any).extractFinalResponse(events);
      expect(finalResponse).not.toContain('[research_agent]:');
      expect(finalResponse).toContain('The history of Rome');
    });

    it('instructs the LLM to format code-focused responses compactly without overviews', async () => {
      const orchestrator = new ReactiveOrchestrator();
      // Spy on the registry to verify the system prompt being passed matches the new formatting rules
      const callWithFallbackSpy = vi.spyOn((orchestrator as any).registry, 'callWithFallback').mockResolvedValue({
        text: 'Mocked code response', model: 'test', provider: 'test', latencyMs: 100
      });
      
      await (orchestrator as any).callWithFallback(
        [{ event_type: 'user_message', content: '[Focus: code] write a loop', author: 'user', id: 1, session_id: 's1', seq: 1 }], 
        { agentName: 'synthesis_agent', confidence: 1, proposedAction: 'test', expectedOutputShape: 'text' }
      );
      
      const passedOpts = callWithFallbackSpy.mock.calls[0][1];
      expect(passedOpts.systemPrompt).toContain('For CODE requests: Provide a brief explanation, ONE main code example');
      expect(passedOpts.systemPrompt).toContain('Do NOT write long encyclopedic overviews');
    });
  });

  describe('Fallback & Echo Prevention', () => {
    it('should not echo the user_message when a run fails without a terminal event', () => {
      const orchestrator = new ReactiveOrchestrator();
      const events: any[] = [
        { id: 1, session_id: 's1', seq: 1, event_type: 'user_message', author: 'user', content: 'What is the meaning of life?' }
      ];
      
      // Use any to bypass private method constraint in test
      const finalResponse = (orchestrator as any).extractFinalResponse(events);
      expect(finalResponse).not.toBe('What is the meaning of life?');
      expect(finalResponse).toBe('No final response generated.');
    });

    it('should fallback to last specialist output if no terminal event exists', () => {
      const orchestrator = new ReactiveOrchestrator();
      const events: any[] = [
        { id: 1, session_id: 's1', seq: 1, event_type: 'user_message', author: 'user', content: 'Write a loop' },
        { id: 2, session_id: 's1', seq: 2, event_type: 'code_written', author: 'code_agent', content: 'for i in range(10): pass' }
      ];
      
      const finalResponse = (orchestrator as any).extractFinalResponse(events);
      expect(finalResponse).toBe('for i in range(10): pass');
    });
  });
});
