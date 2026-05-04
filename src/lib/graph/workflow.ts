import { StateGraph, START, END, MemorySaver } from '@langchain/langgraph';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { BaseMessage, AIMessage } from '@langchain/core/messages';
import { AuraStateSchema } from './state';
import { ResearchAgent } from '../agents/ResearchAgent';
import { CodeAgent } from '../agents/CodeAgent';
import { SynthesisAgent } from '../agents/SynthesisAgent';
import { ProviderRegistry } from '../providers/ProviderRegistry';
import { ToolRegistry } from '../tools/registry';
import { writeMemoryDef, writeMemoryFn } from '../tools/builtin/write_memory';
import { getFileSkeletonDef, getFileSkeletonFn, searchCodebaseDef, searchCodebaseFn } from '../context/ContextTools';
import { readFileDef, readFileFn } from '../tools/builtin/read_file';
import { listDirectoryDef, listDirectoryFn } from '../tools/builtin/list_directory';
import { writeFileDef, writeFileFn } from '../tools/builtin/write_file';
import { editFileDef, editFileFn } from '../tools/builtin/edit_file';
import { runCommandDef, runCommandFn } from '../tools/builtin/run_command';
import { resolveModel, truncatePayload, ModelRole } from '../ModelConfig';
import { searchRelevantFiles, formatContextForPrompt } from '../context/PseudoVectorEngine';
import db from '../../db/index';
import { BlackboardEvent, AgentBid } from '../../shared/types';
import { broadcastEvent } from '../debug';

/**
 * Resolve the model to use for a given agent and role.
 * Priority: agent override > role config > preferredModel > default role model
 */
function resolveModelForAgent(
  agentName: string,
  role: ModelRole,
  state: typeof AuraStateSchema.State
): string | undefined {
  // 1. Check agent-specific override (highest priority)
  if (state.agentModelOverrides && state.agentModelOverrides[agentName]) {
    console.log(`[Graph] Using agent override for ${agentName}: ${state.agentModelOverrides[agentName]}`);
    return state.agentModelOverrides[agentName];
  }

  // 2. Check role-based config
  if (state.modelConfig && state.modelConfig[role]) {
    console.log(`[Graph] Using role config for ${role}: ${state.modelConfig[role]}`);
    return state.modelConfig[role];
  }

  // 3. Check preferredModel (legacy, for backward compatibility)
  if (state.preferredModel) {
    console.log(`[Graph] Using preferredModel: ${state.preferredModel}`);
    return state.preferredModel;
  }

  // 4. Fall back to default role model (resolveModel handles quotas)
  return undefined; // Let the agent use its default
}

// Initialize isolated registries for the graph prototype
const registry = new ProviderRegistry();
const toolRegistry = new ToolRegistry()
  .register(getFileSkeletonDef, getFileSkeletonFn)
  .register(searchCodebaseDef,  searchCodebaseFn)
  .register(readFileDef,        readFileFn)
  .register(listDirectoryDef,   listDirectoryFn)
  .register(writeMemoryDef,     writeMemoryFn)
  .register(writeFileDef,       writeFileFn)
  .register(editFileDef,        editFileFn)
  .register(runCommandDef,      runCommandFn);
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
      events.push({ id: 0, seq: 0, session_id: 'mock', event_type: 'user_message', author: 'user', content: msg.content as string, created_at: '', metadata: null });
    } else if (msg._getType() === 'ai') {
      let content = msg.content as string;
      let author: BlackboardEvent['author'] = 'synthesis_agent'; // Default to synthesis for non-prefixed AI messages
      let event_type: BlackboardEvent['event_type'] = 'agent_output';

      // Map Mock prefixes back to the correct agent for heuristic evaluation
      if (content.startsWith('[code_agent]')) { author = 'code_agent'; event_type = 'code_written'; }
      if (content.startsWith('[research_agent]')) { author = 'research_agent'; }
      if (content.startsWith('[synthesis_agent]')) { author = 'synthesis_agent'; event_type = 'synthesis_complete'; }
      if (content.startsWith('[execution_error]')) {
        author = 'orchestrator'; // Errors are attributed to the system
        event_type = 'execution_error';
        content = content.replace('[execution_error]: ', '');
      }

      events.push({ id: 0, seq: 0, session_id: 'mock', event_type, author, content, created_at: '', metadata: null });
    }
  }
  return events;
}

// --- Keyword definitions (ported from ReactiveOrchestrator) ---
const SYNTHESIS_GREETING_KEYWORDS = [
  'hello', 'hi', 'hey', 'good morning', 'good evening',
  'what can you do', 'who are you', 'how do you work',
  'what are you', 'your capabilities',
];

const RESEARCH_EXTRA_KEYWORDS = [
  'what is', 'how does', 'why does', 'explain', 'tell me about',
  'who is', 'when did', 'where is', 'compare', 'difference between',
  'pros and cons', 'definition', 'meaning of', 'history of', 'overview',
];

const CODE_EXTRA_KEYWORDS = [
  'code', 'function', 'script', 'program', 'implement',
  'build', 'develop', 'debug', 'fix bug', 'error', 'bug',
  'syntax', 'refactor', 'component', 'hook', 'api', 'endpoint',
  'typescript', 'javascript', 'python', 'react', 'node',
  'css', 'html', 'sql', 'json', 'xml',
];

function isSynthesisGreeting(text: string): boolean {
  const t = text.toLowerCase();
  const hasIdentityAnchor =
    t.includes('what can you') || t.includes('who are you') || t.includes('how do you work');
  if (text.length <= 30) return SYNTHESIS_GREETING_KEYWORDS.some(k => t.includes(k));
  return hasIdentityAnchor;
}

async function orchestratorNode(state: typeof AuraStateSchema.State) {
  console.log('[Graph] Orchestrator evaluating state...');
  const events = stateToEvents(state.chatHistory, state.taskWorkspace);

  // Broadcast orchestrator evaluation to debug WebSocket
  if (state.sessionId) {
    broadcastEvent(state.sessionId, {
      type: 'orchestrator',
      agent: 'orchestrator',
      content: 'Evaluating agent bids...',
      timestamp: Date.now()
    });
  }

  const bids: AgentBid[] = agents.map(a => a.evaluate(events));
  
  // --- Synthesis guard (ported from ReactiveOrchestrator) ---
  // Synthesis is ONLY allowed to win when:
  //   a) It's a genuine greeting/identity question (conversational fallback), OR
  //   b) A specialist has already produced output AND no specialist has a live bid
  //      above threshold (i.e., it acts as a final formatter, never a competitor).
  const synthIdx = bids.findIndex(b => b.agentName === 'synthesis_agent');
  if (synthIdx !== -1) {
    const synthBid = bids[synthIdx];
    const WINNER_CONFIDENCE_THRESHOLD = 0.30;
    
    // Check if specialist output exists in current turn
    const lastUserMsgIdx = [...events].reverse().findIndex(e => e.event_type === 'user_message');
    const currentTurnStart = lastUserMsgIdx >= 0 ? events.length - 1 - lastUserMsgIdx : 0;
    const currentTurnEvents = events.slice(currentTurnStart);
    
    const specialistOutputExists = currentTurnEvents.some(
      e => (e.event_type === 'agent_output' || e.event_type === 'code_written') && e.author !== 'synthesis_agent'
    );
    const specialistBiddingNow = bids.some(
      b => b.agentName !== 'synthesis_agent' && b.confidence >= WINNER_CONFIDENCE_THRESHOLD
    );
    
    // Get last user message for greeting check
    const lastUserMsg = currentTurnEvents.find(e => e.event_type === 'user_message')?.content ?? '';
    
    // Allow Mode 1 (high confidence) only when specialist has finished AND no specialist is competing now
    const allowMode1 = synthBid.confidence >= 0.85 && specialistOutputExists && !specialistBiddingNow;
    // Allow Mode 2 (greeting) only for genuine greetings
    const allowMode2 = synthBid.confidence < 0.85 && isSynthesisGreeting(lastUserMsg);
    
    if (!allowMode1 && !allowMode2) {
      bids[synthIdx] = { ...synthBid, confidence: 0 };
      console.log('[Graph] Synthesis guard activated - blocking synthesis agent');
    }
  }
  
  // --- Research boost ---
  const researchIdx = bids.findIndex(b => b.agentName === 'research_agent');
  if (researchIdx !== -1) {
    const lastUserMsg = [...state.chatHistory].reverse().find(m => m._getType() === 'human');
    if (lastUserMsg && typeof lastUserMsg.content === 'string') {
      const t = lastUserMsg.content.toLowerCase();
      const hasExtraResearch = RESEARCH_EXTRA_KEYWORDS.some(k => t.includes(k));
      const questionBoost = (t.includes('?') || /\b(what|how|why)\b/.test(t)) ? 0.1 : 0;
      
      if (hasExtraResearch || questionBoost > 0) {
        bids[researchIdx] = {
          ...bids[researchIdx],
          confidence: Math.min(0.90, bids[researchIdx].confidence + 0.1 + questionBoost),
        };
        console.log(`[Graph] Research boost applied - new confidence: ${bids[researchIdx].confidence.toFixed(2)}`);
      }
    }
  }
  
  // --- Code boost ---
  const codeIdx = bids.findIndex(b => b.agentName === 'code_agent');
  if (codeIdx !== -1 && bids[codeIdx].confidence === 0) {
    const lastUserMsg = [...state.chatHistory].reverse().find(m => m._getType() === 'human');
    if (lastUserMsg && typeof lastUserMsg.content === 'string') {
      const t = lastUserMsg.content.toLowerCase();
      const isIntentionalAbstain = /abstain|standing down/i.test(bids[codeIdx].proposedAction);
      
      if (!isIntentionalAbstain && CODE_EXTRA_KEYWORDS.some(k => t.includes(k))) {
        bids[codeIdx] = {
          ...bids[codeIdx],
          confidence: 0.55,
          proposedAction: 'Generate or explain code for detected code-related query',
        };
        console.log('[Graph] Code boost applied - injected bid for code-related query');
      }
    }
  }
  
  const winner = bids.sort((a, b) => b.confidence - a.confidence)[0];

  if (!winner || winner.confidence === 0) {
    console.log('[Graph] No bids. Ending workflow.');
    if (state.sessionId) {
      broadcastEvent(state.sessionId, {
        type: 'no_bids',
        agent: 'orchestrator',
        content: 'No agent bids accepted. Ending workflow.',
        timestamp: Date.now()
      });
    }
    return { activeAgent: 'end' };
  }

  console.log(`[Graph] Routed to: ${winner.agentName} (confidence: ${winner.confidence.toFixed(2)})`);
  
  // Broadcast routing decision to debug WebSocket
  if (state.sessionId) {
    broadcastEvent(state.sessionId, {
      type: 'agent_selected',
      agent: winner.agentName,
      content: `Routed to ${winner.agentName} (confidence: ${winner.confidence.toFixed(2)})`,
      timestamp: Date.now()
    });
  }
  
  return { activeAgent: winner.agentName };
}

async function specialistNode(state: typeof AuraStateSchema.State) {
  console.log(`\n[Graph] --- Specialist node executing: ${state.activeAgent} ---`);
  
  // Broadcast specialist execution start to debug WebSocket
  if (state.sessionId) {
    broadcastEvent(state.sessionId, {
      type: 'agent_start',
      agent: state.activeAgent,
      content: `Executing ${state.activeAgent}...`,
      timestamp: Date.now()
    });
  }
  
  const agent = agents.find(a => a.name === state.activeAgent);
  if (!agent) throw new Error(`Agent ${state.activeAgent} not found.`);

  // Convert to legacy events so the agent can read the current thread
  const events = stateToEvents(state.chatHistory, state.taskWorkspace);

  // Generate a mock bid to satisfy the interface (Orchestrator already chose it)
  const bid: AgentBid = { agentName: agent.name, confidence: 1.0, proposedAction: 'Execute from Graph workflow', expectedOutputShape: 'text' };

  // Inject pseudo-vector context for CodeAgent
  if (state.activeAgent === 'code_agent') {
    console.log(`[Graph] Injecting pseudo-vector context for CodeAgent...`);
    try {
      // Extract the user's latest message as the query
      const userMessage = [...state.chatHistory]
        .reverse()
        .find(m => m._getType() === 'human');
      
      if (userMessage && typeof userMessage.content === 'string') {
        const query = userMessage.content;
        const results = await searchRelevantFiles(query, 'src', { maxResults: 5 });
        
        if (results.length > 0) {
          const contextStr = formatContextForPrompt(results);
          console.log(`[Graph] Found ${results.length} relevant files for query: "${query.slice(0, 50)}..."`);
          
          // Add context to taskWorkspace so the agent can see it
          const contextMessage = new AIMessage(`[pseudo_vector_context]:\n${contextStr}`);
          state.taskWorkspace.push(contextMessage);
        }
      }
    } catch (err: any) {
      console.error('[Graph] Pseudo-vector context injection failed:', err.message);
    }
  }

  try {
    // Run the REAL LLM ReAct loop!
    const result = await agent.execute(events, bid);

    if (result.event_type === 'escalation_required') {
      console.log(`[Graph] ⚠️ ${state.activeAgent} escalated:`, result.content);
      return {
        taskWorkspace: [...state.taskWorkspace, new AIMessage(`[execution_error]: ${result.content}`)],
        errorCount: 1
      };
    }

    // Phase 3: Active Context Window Truncation (Dynamic Pointer Index)
    // Intercept massive payloads to prevent context rot mid-turn.
    const safeContent = truncatePayload(result.content, 'daily_driver');

    // Broadcast completion to debug WebSocket
    if (state.sessionId) {
      broadcastEvent(state.sessionId, {
        type: 'agent_complete',
        agent: state.activeAgent,
        content: safeContent.slice(0, 200) + (safeContent.length > 200 ? '...' : ''),
        timestamp: Date.now()
      });
    }

    // Because taskWorkspace has an 'overwrite' reducer, we spread the existing
    // state to accumulate this new message, exactly like the Claude/Codex loop.
    return {
      taskWorkspace: [...state.taskWorkspace, new AIMessage(`[${state.activeAgent}]: ${safeContent}`)],
      errorCount: 0 // Reset circuit breaker on success
    };
  } catch (err: any) {
    console.error(`[Graph] ⚠️ ${state.activeAgent} threw an error:`, err.message);
    
    // Broadcast error to debug WebSocket
    if (state.sessionId) {
      broadcastEvent(state.sessionId, {
        type: 'agent_error',
        agent: state.activeAgent,
        content: err.message,
        timestamp: Date.now()
      });
    }
    
    const errorJson = JSON.stringify({ agent: state.activeAgent, error: err.message });
    return {
      taskWorkspace: [...state.taskWorkspace, new AIMessage(`[execution_error]: ${errorJson}`)],
      errorCount: 1, // Reducer will add this to state
      errorHistory: [`${new Date().toISOString()} - ${state.activeAgent}: ${err.message}`]
    };
  }
}

async function synthesisNode(state: typeof AuraStateSchema.State) {
  console.log(`\n[Graph] --- Synthesis node executing... condensing history ---`);
  
  // Broadcast synthesis start to debug WebSocket
  if (state.sessionId) {
    broadcastEvent(state.sessionId, {
      type: 'synthesis_start',
      agent: 'synthesis_agent',
      content: 'Synthesizing final answer...',
      timestamp: Date.now()
    });
  }
  
  const agent = agents.find(a => a.name === 'synthesis_agent');
  if (!agent) throw new Error('Synthesis agent not found.');

  const events = stateToEvents(state.chatHistory, state.taskWorkspace);
  const bid: AgentBid = { 
    agentName: 'synthesis_agent', 
    confidence: 1.0, 
    proposedAction: 'Synthesise final answer', 
    expectedOutputShape: 'text' 
  };

  // Resolve model using priority: agent override > role config > preferredModel > default
  const resolvedModel = resolveModelForAgent('synthesis_agent', 'agent_orchestrator', state);
  if (resolvedModel) {
    console.log(`[Graph] Synthesis using model: ${resolvedModel}`);
    (bid as any).preferredModel = resolvedModel;
  }

  const energyMode = state.energyMode || 'high';
  console.log(`[Graph] Energy mode: ${energyMode}`);

  const energyContext = energyMode === 'low'
    ? '[ENERGY_MODE: LOW] Provide extremely concise, bullet-point responses. No fluff, no explanations unless critical.'
    : '[ENERGY_MODE: HIGH] Provide detailed, thorough responses with context and explanations.';

  // Create proper BlackboardEvent for energy context
  const energyEvent: BlackboardEvent = {
    id: 0,
    seq: 0,
    session_id: 'mock',
    event_type: 'user_message',
    author: 'user',
    content: energyContext,
    created_at: '',
    metadata: null
  };

  const modifiedEvents = [energyEvent, ...events];
  const result = await agent.execute(modifiedEvents, bid);

  if (result.event_type === 'escalation_required') {
    console.log('[Graph] Synthesis agent escalated:', result.content);

    // Broadcast escalation to debug WebSocket
    if (state.sessionId) {
      broadcastEvent(state.sessionId, {
        type: 'escalation',
        agent: 'synthesis_agent',
        content: result.content,
        timestamp: Date.now()
      });
    }

    return {
      chatHistory: [new AIMessage(`[execution_error]: ${result.content}`)],
    };
  }

  // Broadcast synthesis completion to debug WebSocket
  if (state.sessionId) {
    broadcastEvent(state.sessionId, {
      type: 'synthesis_complete',
      agent: 'synthesis_agent',
      content: result.content.slice(0, 200) + (result.content.length > 200 ? '...' : ''),
      timestamp: Date.now()
    });
  }

  return {
    chatHistory: [new AIMessage(result.content)], // Append the real generated answer
  };
}

async function compactionNode(state: typeof AuraStateSchema.State) {
  console.log(`\n[Graph] --- Compaction node executing... extracting memory ---`);

  const workspaceText = state.taskWorkspace.map(m => m.content).join('\n');
  
  if (workspaceText.trim() && workspaceText.length > 100) {
    const prompt = `Review the following agent scratchpad and extract any newly discovered, permanent facts about the user, their system, or project conventions.
If there is nothing notable to remember for the future, reply exactly with "NONE".
Otherwise, provide a concise bulleted list of facts.

Scratchpad:
${workspaceText.substring(0, 8000)}`; // limit context to avoid token bloat

    try {
      // Use a fast, cheap model for summarization
      const result = await registry.call(resolveModel('compaction'), prompt, { temperature: 0.1 });
      if (result.text && !result.text.includes('NONE')) {
        console.log(`[Graph] Saving long-term memory: \n${result.text.trim()}`);
        await toolRegistry.execute({
          id: 'compaction',
          name: 'write_memory',
          arguments: { file: 'USER', content: `Session extracted facts:\n${result.text.trim()}` }
        });
      }
    } catch (e: any) {
      console.error('[Graph] Compaction LLM call failed, skipping:', e.message);
    }
  }

  // WIPE the ephemeral workspace, preventing context rot
  return { taskWorkspace: [] };
}

export const workflow = new StateGraph(AuraStateSchema)
  .addNode('orchestrator', orchestratorNode)
  .addNode('research_agent', specialistNode)
  .addNode('code_agent', specialistNode)
  .addNode('synthesis_agent', synthesisNode)
  .addNode('compaction', compactionNode)
  .addEdge(START, 'orchestrator');

workflow.addConditionalEdges('orchestrator', (state) => {
  if (state.errorCount >= 3) {
    console.log('[Graph] 🛑 Circuit breaker tripped! Too many consecutive errors. Forcing synthesis fallback.');
    return 'synthesis_agent';
  }
  return state.activeAgent === 'end' ? END : state.activeAgent;
});
workflow.addEdge('research_agent', 'orchestrator');
workflow.addEdge('code_agent', 'orchestrator');
workflow.addEdge('synthesis_agent', 'compaction');
workflow.addEdge('compaction', END); // Compaction is the new terminal node

// Phase 5: Checkpointer Integration
// Binding SqliteSaver allows the graph to preserve state durably across
// sessions (orchestrate_sessions + blackboard_events) for durable session resume.
// Uses the same better-sqlite3 db instance as the rest of the application.
export const checkpointer = new SqliteSaver(db);
export const compiledGraph = workflow.compile({ checkpointer });