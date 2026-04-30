import { AgentBid, AgentOutput, BlackboardEvent } from '../../shared/types';
import { BaseAgent } from './types';
import { buildSupervisorPrompt } from '../prompts/AgentWiring';
import { resolveModel, peekFallbackChain } from '../ModelConfig';

export class SupervisorAgent extends BaseAgent {
  readonly name = 'supervisor_agent' as const;

  private getHealthyModel(): string | undefined {
    return peekFallbackChain('agent_orchestrator').find(m => this.isProviderHealthy(m));
  }

  evaluate(events: BlackboardEvent[]): AgentBid {
    const model = this.getHealthyModel();
    if (!model) {
      return { agentName: 'supervisor_agent', confidence: 0, proposedAction: 'Provider unavailable', expectedOutputShape: 'text' };
    }

    const userMsg = this.userMessage(events).toLowerCase();
    
    let complexityScore = 0;
    if (userMsg.includes(' and ')) complexityScore++;
    if (userMsg.includes(' then ')) complexityScore++;
    if (userMsg.split(' ').length > 15) complexityScore++;
    if (/(build|create|app|system|project|setup)/i.test(userMsg)) complexityScore++;
    
    const alreadyRan = this.outputsBy(events, 'supervisor_agent').length > 0;

    if (!alreadyRan && complexityScore >= 2) {
      return {
        agentName: 'supervisor_agent',
        confidence: 0.85,
        proposedAction: 'Decompose complex request into an execution plan',
        expectedOutputShape: 'text'
      };
    }

    return { agentName: 'supervisor_agent', confidence: 0, proposedAction: 'Task is simple enough for specialist agents', expectedOutputShape: 'text' };
  }

  async execute(events: BlackboardEvent[], bid: AgentBid): Promise<AgentOutput> {
    const lastUserIdx = [...events].reverse().findIndex(e => e.event_type === 'user_message');
    const currentTurnEvents = lastUserIdx >= 0 ? events.slice(events.length - 1 - lastUserIdx) : events;

    const SYSTEM_PROMPT = buildSupervisorPrompt({
      sessionPhase: events.length < 3 ? 'initial' : 'ongoing',
    });

    const messages = this.buildMessages(currentTurnEvents, SYSTEM_PROMPT);

    let model = resolveModel('agent_orchestrator');
    if (!this.isProviderHealthy(model)) model = this.getHealthyModel() as string;

    const result = await this.registry.call(model, '', { temperature: 0.0, messages });

    return {
      event_type: 'agent_output',
      content: result.text,
      metadata: {
        model_id: result.model,
        latency_ms: result.latencyMs,
        confidence: bid.confidence,
        tokens_in: result.tokensIn,
        tokens_out: result.tokensOut,
      },
    };
  }
}
