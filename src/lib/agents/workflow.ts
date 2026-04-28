import { StateGraph, START, END } from '@langchain/langgraph';
import { BaseMessage, AIMessage } from '@langchain/core/messages';
import { AuraStateSchema } from '../agents/state';
import { ResearchAgent } from '../agents/ResearchAgent';
import { CodeAgent } from '../agents/CodeAgent';
import { SynthesisAgent } from '../agents/SynthesisAgent';
import { ProviderRegistry } from '../providers/ProviderRegistry';
import { ToolRegistry } from '../tools/registry';
import { BlackboardEvent, AgentBid } from '../../shared/types';

// Initialize isolated registries for the graph prototype
const registry = new ProviderRegistry();
const toolRegistry = new ToolRegistry();
const agents = [
  new ResearchAgent(registry, toolRegistry),
  new CodeAgent(registry, toolRegistry),
  new SynthesisAgent(registry, toolRegistry),
];

/**
 * Bridge function: Converts LangGraph's BaseMessage array back into legacy
 * BlackboardEvents purely so we can reuse the existing battle-tested
 * evaluation heuristics without rewriting them yet.
 */
function stateToEvents(chatHistory: BaseMessage[], workspace: BaseMessage[]): BlackboardEvent[] {
  const events: BlackboardEvent[] = [];
  const allMessages = [...chatHistory, ...workspace];

  for (const msg of allMessages) {
    if (msg._getType() === 'human') {
      events.push({ id: 'mock', session_id: 'mock', event_type: 'user_message', author: 'user', content: msg.content as string, created_at: '' });
    } else if (msg._getType() === 'ai') {
      const content = msg.content as string;
      let author = 'agent';
      let event_type: BlackboardEvent['event_type'] = 'agent_output';

      // Map Mock prefixes back to the correct agent for heuristic evaluation
      if (content.startsWith('[code_agent]')) { author = 'code_agent'; event_type = 'code_written'; }
      if (content.startsWith('[research_agent]')) { author = 'research_agent'; }
      if (content.startsWith('[synthesis_agent]')) { author = 'synthesis_agent'; event_type = 'synthesis_complete'; }

      events.push({ id: 'mock', session_id: 'mock', event_type, author, content, created_at: '' });
    }
  }
  return events;
}

async function orchestratorNode(state: typeof AuraStateSchema.State) {
  console.log('[Graph] Orchestrator evaluating state...');
  const events = stateToEvents(state.chatHistory, state.taskWorkspace);

  const bids: AgentBid[] = agents.map(a => a.evaluate(events));
  const winner = bids.sort((a, b) => b.confidence - a.confidence)[0];

  if (!winner || winner.confidence === 0) {
    console.log('[Graph] No bids. Ending workflow.');
    return { activeAgent: 'end' };
  }

  console.log(`[Graph] Routed to: ${winner.agentName} (confidence: ${winner.confidence.toFixed(2)})`);
  return { activeAgent: winner.agentName };
}

async function specialistNode(state: typeof AuraStateSchema.State) {
  console.log(`[Graph] Specialist node executing: ${state.activeAgent}`);
  // MOCK: Phase 1 Step 3 will wire this to the actual LLM ReAct loop.
  // Since taskWorkspace has an 'overwrite' reducer, we spread the existing state to accumulate.
  return {
    taskWorkspace: [...state.taskWorkspace, new AIMessage(`[${state.activeAgent}] Mocked tool reasoning completion`)]
  };
}

async function synthesisNode(state: typeof AuraStateSchema.State) {
  console.log(`[Graph] Synthesis node executing... condensing history.`);
  return {
    chatHistory: [new AIMessage(`[synthesis_agent] Final condensed answer.`)],
    taskWorkspace: [], // Explicit overwrite reducer triggers here: WIPES the workspace!
  };
}

export const workflow = new StateGraph(AuraStateSchema)
  .addNode('orchestrator', orchestratorNode)
  .addNode('research_agent', specialistNode)
  .addNode('code_agent', specialistNode)
  .addNode('synthesis_agent', synthesisNode)
  .addEdge(START, 'orchestrator');

workflow.addConditionalEdges('orchestrator', (state) => state.activeAgent === 'end' ? END : state.activeAgent);
workflow.addEdge('research_agent', 'orchestrator');
workflow.addEdge('code_agent', 'orchestrator');
workflow.addEdge('synthesis_agent', END); // Synthesis is terminal

export const compiledGraph = workflow.compile();