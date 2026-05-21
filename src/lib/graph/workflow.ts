import { StateGraph, START, END, interrupt } from '@langchain/langgraph';
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';
import { BaseMessage, AIMessage } from '@langchain/core/messages';
import { AuraStateSchema } from './state';
import { ResearchAgent } from '../agents/ResearchAgent';
import { CodeAgent } from '../agents/CodeAgent';
import { SynthesisAgent } from '../agents/SynthesisAgent';
import { BureaucracyAgent } from '../agents/BureaucracyAgent';
import { getSharedRegistry } from '../RegistrySingleton';
import { ToolRegistry } from '../tools/registry';
import { writeMemoryDef, writeMemoryFn } from '../tools/builtin/write_memory';
import { getFileSkeletonDef, getFileSkeletonFn, searchCodebaseDef, searchCodebaseFn } from '../context/ContextTools';
import { readFileDef, readFileFn } from '../tools/builtin/read_file';
import { listDirectoryDef, listDirectoryFn } from '../tools/builtin/list_directory';
import { writeFileDef, writeFileFn } from '../tools/builtin/write_file';
import { editFileDef, editFileFn } from '../tools/builtin/edit_file';
import { runCommandDef, runCommandFn } from '../tools/builtin/run_command';
import { generateDocumentDef, generateDocumentFn } from '../tools/builtin/generate_document';
import { createEtsyListingDef, createEtsyListingFn, updateEtsyListingDef, updateEtsyListingFn, publishToPrintifyDef, publishToPrintifyFn } from '../tools/builtin/etsy_printify';
import { generateBusinessPlanDef, generateBusinessPlanFn, generatePitchDeckDef, generatePitchDeckFn } from '../tools/builtin/funding';
import { firecrawlDef, firecrawlFn } from '../tools/builtin/firecrawl';
import { truncatePayload, ModelRole } from '../ModelConfig';
import { resolveModel } from '../ModelConfig.server';
import { searchRelevantFiles, formatContextForPrompt } from '../context/PseudoVectorEngine';
import { VetoManager } from '../veto/VetoManager';
import { VetoApprovalNeededError } from '../veto/VetoError';
import db from '../../db/index';
import { BlackboardEvent, AgentBid } from '../../shared/types';
import { broadcastEvent } from '../debug';

// Store veto managers per session
const sessionVetoManagers = new Map<string, VetoManager>();

export function getVetoManager(sessionId: string): VetoManager {
  if (!sessionVetoManagers.has(sessionId)) {
    const manager = new VetoManager(sessionId, {
      defaultBehavior: 'auto-approve',
    });
    sessionVetoManagers.set(sessionId, manager);
  }
  return sessionVetoManagers.get(sessionId)!;
}

/** Remove stale veto managers to prevent unbounded memory growth */
export function cleanupOldVetoManagers(maxAgeMs = 3600_000): void {
  const cutoff = Date.now() - maxAgeMs;
  for (const [sessionId, manager] of sessionVetoManagers) {
    manager.cleanup();
    // If manager has no pending actions after cleanup, remove it
    if (manager.getPendingActions().length === 0) {
      sessionVetoManagers.delete(sessionId);
    }
  }
}

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

// Initialize shared registries for the graph
const registry = getSharedRegistry();
const toolRegistry = new ToolRegistry()
  .register(getFileSkeletonDef, getFileSkeletonFn)
  .register(searchCodebaseDef,  searchCodebaseFn)
  .register(readFileDef,        readFileFn)
  .register(listDirectoryDef,   listDirectoryFn)
  .register(writeMemoryDef,     writeMemoryFn)
  .register(writeFileDef,       writeFileFn)
  .register(editFileDef,        editFileFn)
  .register(runCommandDef,      runCommandFn)
  .register(generateDocumentDef, generateDocumentFn)
  .register(createEtsyListingDef, createEtsyListingFn)
  .register(updateEtsyListingDef, updateEtsyListingFn)
  .register(publishToPrintifyDef, publishToPrintifyFn)
  .register(generateBusinessPlanDef, generateBusinessPlanFn)
  .register(generatePitchDeckDef, generatePitchDeckFn)
  .register(firecrawlDef, firecrawlFn);

// Initialize Veto Manager for authorization layer
// VetoManager will be created per-session in the orchestrator node

const agents = [
  new ResearchAgent(registry, toolRegistry),
  new CodeAgent(registry, toolRegistry),
  new SynthesisAgent(registry, toolRegistry),
  new BureaucracyAgent(registry, toolRegistry),
];

/**
 * Sanitize agent output by stripping raw agent labels, pseudo-vector
 * context markers, and execution error prefixes that can leak to the UI
 * when synthesis fails or when the echo-loop guard fires.
 */
function sanitizeAgentOutput(text: string): string {
  return text
    .replace(/\[\w+_agent\]:\s*/g, '')            // [code_agent]:, [research_agent]:, [synthesis_agent]:, [bureaucracy_agent]:
    .replace(/\[pseudo_vector_[^\]]+\]:\s*/g, '')  // [pseudo_vector_context]:
    .replace(/\[execution_error\]:\s*/g, '')       // [execution_error]:
    .replace(/\*\*\[[^\]]+\]\*\*:\s*/g, '')       // **[code_agent]**:
    // P3-FOLLOW-UP: Strip "**synthesis_agent** produced the following:" and variants
    .replace(/\*\*\w+_agent\*\*\s+produced\s+the\s+following:\s*/gi, '')
    .replace(/\w+_agent\s+produced\s+the\s+following:\s*/gi, '')
    // BUG-5: Strip pseudo-vector content blocks that leaked into output
    .replace(/## Relevant Files \(Pseudo-Vector Search Results\)[\s\S]*?(?=\n#{1,2}\s|\n\n[A-Z]|$)/gi, '')
    .replace(/### [^\n]+\nScore:\s*[\d.]+\n````[\s\S]*?````/gi, '')
    .replace(/Score:\s*[\d.]+/gi, '')
    .replace(/Found \d+ relevant files:/gi, '')
    .trim();
}

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
      if (content.startsWith('[code_agent]')) {
        author = 'code_agent';
        event_type = 'code_written';
        content = content.replace(/^\[code_agent\]:\s*/, '');
      } else if (content.startsWith('[research_agent]')) {
        author = 'research_agent';
        content = content.replace(/^\[research_agent\]:\s*/, '');
      } else if (content.startsWith('[synthesis_agent]')) {
        author = 'synthesis_agent';
        event_type = 'synthesis_complete';
        content = content.replace(/^\[synthesis_agent\]:\s*/, '');
      } else if (content.startsWith('[execution_error]')) {
        author = 'orchestrator'; // Errors are attributed to the system
        event_type = 'execution_error';
        content = content.replace(/^\[execution_error\]:\s*/, '');
      } else if (content.startsWith('[pseudo_vector_context]')) {
        // Pseudo-vector context is internal data, not an agent output.
        // Map it to a special event type that buildMessages will skip.
        author = 'orchestrator';
        event_type = 'code_context_retrieved';
        content = content.replace(/^\[pseudo_vector_context\]:\s*/, '');
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
  //      above threshold (i.e., it acts as a final formatter, never a competitor), OR
  //   c) No specialist agent bid at all — conversational fallback so the user
  //      gets a response instead of "Workflow ended without generating a response."
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
    // Allow Mode 3 (conversational fallback) when no specialist agent is bidding at all
    const noSpecialistBidding = !bids.some(
      b => b.agentName !== 'synthesis_agent' && b.confidence >= WINNER_CONFIDENCE_THRESHOLD
    );
    const allowMode3 = synthBid.confidence < 0.85 && noSpecialistBidding && !specialistOutputExists;
    // Allow Mode 4 (Brain Dump bypass)
    const isBrainDump = lastUserMsg.includes('[BRAIN DUMP MODE]');
    
    if (isBrainDump) {
      bids[synthIdx] = { ...synthBid, confidence: 0.95, proposedAction: 'Decompose vague goal into structured checklist' };
      console.log('[Graph] Brain dump bypass - routing to synthesis agent');
    } else if (!allowMode1 && !allowMode2 && !allowMode3) {
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

  // Initialize veto manager for this session
  if (state.sessionId) {
    const vetoManager = getVetoManager(state.sessionId);
    toolRegistry.setVetoManager(vetoManager);
  }

  // Convert to legacy events so the agent can read the current thread
  const events = stateToEvents(state.chatHistory, state.taskWorkspace);

  // Generate a mock bid to satisfy the interface (Orchestrator already chose it)
  const bid: AgentBid = { agentName: agent.name as any, confidence: 1.0, proposedAction: 'Execute from Graph workflow', expectedOutputShape: 'text' };

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
        taskWorkspace: [...state.taskWorkspace, new AIMessage(`[execution_error]: ${sanitizeAgentOutput(result.content)}`)],
        errorCount: 1
      };
    }

    // Phase 3: Active Context Window Truncation (Dynamic Pointer Index)
    // Intercept massive payloads to prevent context rot mid-turn.
    const rawContent = result.content || '';
    if (!rawContent) {
      console.warn(`[Graph] ⚠️ ${state.activeAgent} returned empty content`);
    }
    const safeContent = truncatePayload(rawContent, 'daily_driver');

    // Broadcast completion to debug WebSocket
    if (state.sessionId) {
      broadcastEvent(state.sessionId, {
        type: 'agent_complete',
        agent: state.activeAgent,
        content: safeContent.slice(0, 200) + (safeContent.length > 200 ? '...' : ''),
        timestamp: Date.now()
      });
    }

    // Because taskWorkspace now has a concat reducer, returning just the new
    // message appends it to the existing workspace. No need to spread state.
    return {
      taskWorkspace: [new AIMessage(`[${state.activeAgent}]: ${sanitizeAgentOutput(safeContent)}`)],
      errorCount: 0 // Reset circuit breaker on success
    };
  } catch (err: any) {
    // Check if this is a Veto approval needed error
    if (err instanceof VetoApprovalNeededError && state.sessionId) {
      console.log(`[Graph] ⚠️ Veto approval needed for action:`, err.action.toolName);
      
      // Pause the graph via LangGraph interrupt.
      // The client receives the approval request over SSE/WebSocket.
      // When approved/modified, the graph is resumed with Command({ resume: ... }).
      // On re-execution, VetoManager will find the action in approvedActions
      // or approvedOverrides and allow the tool to proceed.
      interrupt({
        type: 'approval_required',
        action: err.action,
        message: `Action "${err.action.toolName}" requires approval`,
        sessionId: state.sessionId,
      });
      
      // interrupt() throws GraphInterrupt; this line is only reachable in
      // test environments or if interrupt() is mocked to return.
      return {
        taskWorkspace: state.taskWorkspace,
        errorCount: 0
      };
    }
    
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
      taskWorkspace: [new AIMessage(`[execution_error]: ${errorJson}`)],
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
      chatHistory: [new AIMessage(`[execution_error]: ${sanitizeAgentOutput(result.content)}`)],
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
    chatHistory: [new AIMessage(sanitizeAgentOutput(result.content))], // Append the real generated answer, sanitized for the UI
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
        const trimmed = result.text.trim();
        // Guard against hallucinated loops and garbage output
        const wordCount = trimmed.split(/\s+/).length;
        const hasRepetition = /(\b\w+\b)(?:\s+\1){4,}/i.test(trimmed); // same word 5+ times
        const hasSequenceLoop = /(a sequence of ){3,}/i.test(trimmed);
        const tooShort = wordCount < 3;

        if (tooShort || hasRepetition || hasSequenceLoop) {
          console.warn(`[Graph] Compaction output rejected — too_short=${tooShort}, repetition=${hasRepetition}, sequence_loop=${hasSequenceLoop}`);
        } else {
          console.log(`[Graph] Saving long-term memory: \n${trimmed}`);
          await toolRegistry.execute({
            id: 'compaction',
            name: 'write_memory',
            arguments: { file: 'USER', content: `Session extracted facts:\n${trimmed}` }
          });
        }
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
  .addNode('bureaucracy_agent', specialistNode)
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
workflow.addEdge('bureaucracy_agent', 'synthesis_agent');
workflow.addEdge('synthesis_agent', 'compaction');
workflow.addEdge('compaction', END); // Compaction is the new terminal node

// Phase 5: Checkpointer Integration
// Binding SqliteSaver allows the graph to preserve state durably across
// sessions (orchestrate_sessions + blackboard_events) for durable session resume.
// Uses the same better-sqlite3 db instance as the rest of the application.
export const checkpointer = new SqliteSaver(db);
export const compiledGraph = workflow.compile({ checkpointer })