"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compiledGraph = exports.workflow = void 0;
const langgraph_1 = require("@langchain/langgraph");
const messages_1 = require("@langchain/core/messages");
const state_1 = require("./state");
const ResearchAgent_1 = require("../agents/ResearchAgent");
const CodeAgent_1 = require("../agents/CodeAgent");
const SynthesisAgent_1 = require("../agents/SynthesisAgent");
const ProviderRegistry_1 = require("../providers/ProviderRegistry");
const registry_1 = require("../tools/registry");
const write_memory_1 = require("../tools/builtin/write_memory");
// Initialize isolated registries for the graph prototype
const registry = new ProviderRegistry_1.ProviderRegistry();
const toolRegistry = new registry_1.ToolRegistry()
    .register(write_memory_1.writeMemoryDef, write_memory_1.writeMemoryFn);
const agents = [
    new ResearchAgent_1.ResearchAgent(registry, toolRegistry),
    new CodeAgent_1.CodeAgent(registry, toolRegistry),
    new SynthesisAgent_1.SynthesisAgent(registry, toolRegistry),
];
/**
 * Bridge function: Converts LangGraph's BaseMessage array back into legacy
 * BlackboardEvents purely so we can reuse the existing battle-tested
 * evaluation heuristics without rewriting them yet.
 */
function stateToEvents(chatHistory, workspace) {
    const events = [];
    const allMessages = [...chatHistory, ...workspace];
    for (const msg of allMessages) {
        if (msg._getType() === 'human') {
            events.push({ id: 0, seq: 0, session_id: 'mock', event_type: 'user_message', author: 'user', content: msg.content, created_at: '', metadata: null });
        }
        else if (msg._getType() === 'ai') {
            let content = msg.content;
            let author = 'synthesis_agent'; // Default to synthesis for non-prefixed AI messages
            let event_type = 'agent_output';
            // Map Mock prefixes back to the correct agent for heuristic evaluation
            if (content.startsWith('[code_agent]')) {
                author = 'code_agent';
                event_type = 'code_written';
            }
            if (content.startsWith('[research_agent]')) {
                author = 'research_agent';
            }
            if (content.startsWith('[synthesis_agent]')) {
                author = 'synthesis_agent';
                event_type = 'synthesis_complete';
            }
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
async function orchestratorNode(state) {
    console.log('[Graph] Orchestrator evaluating state...');
    const events = stateToEvents(state.chatHistory, state.taskWorkspace);
    const bids = agents.map(a => a.evaluate(events));
    const winner = bids.sort((a, b) => b.confidence - a.confidence)[0];
    if (!winner || winner.confidence === 0) {
        console.log('[Graph] No bids. Ending workflow.');
        return { activeAgent: 'end' };
    }
    console.log(`[Graph] Routed to: ${winner.agentName} (confidence: ${winner.confidence.toFixed(2)})`);
    return { activeAgent: winner.agentName };
}
async function specialistNode(state) {
    console.log(`\n[Graph] --- Specialist node executing: ${state.activeAgent} ---`);
    const agent = agents.find(a => a.name === state.activeAgent);
    if (!agent)
        throw new Error(`Agent ${state.activeAgent} not found.`);
    // Convert to legacy events so the agent can read the current thread
    const events = stateToEvents(state.chatHistory, state.taskWorkspace);
    // Generate a mock bid to satisfy the interface (Orchestrator already chose it)
    const bid = { agentName: agent.name, confidence: 1.0, proposedAction: 'Execute from Graph workflow', expectedOutputShape: 'text' };
    try {
        // Run the REAL LLM ReAct loop!
        const result = await agent.execute(events, bid);
        // Phase 3: Active Context Window Truncation (Dynamic Pointer Index)
        // Intercept massive payloads to prevent context rot mid-turn.
        let safeContent = result.content;
        if (safeContent.length > 15000) {
            console.log(`[Graph] ⚠️ Payload exceeded limits. Truncating to preserve context window.`);
            safeContent = safeContent.substring(0, 2000) + `\n...[TRUNCATED: Payload too large for ephemeral context. Reference local disk.]`;
        }
        // Because taskWorkspace has an 'overwrite' reducer, we spread the existing
        // state to accumulate this new message, exactly like the Claude/Codex loop.
        return {
            taskWorkspace: [...state.taskWorkspace, new messages_1.AIMessage(`[${state.activeAgent}]: ${safeContent}`)],
            errorCount: 0 // Reset circuit breaker on success
        };
    }
    catch (err) {
        console.error(`[Graph] ⚠️ ${state.activeAgent} threw an error:`, err.message);
        const errorJson = JSON.stringify({ agent: state.activeAgent, error: err.message });
        return {
            taskWorkspace: [...state.taskWorkspace, new messages_1.AIMessage(`[execution_error]: ${errorJson}`)],
            errorCount: 1, // Reducer will add this to state
            errorHistory: [`${new Date().toISOString()} - ${state.activeAgent}: ${err.message}`]
        };
    }
}
async function synthesisNode(state) {
    console.log(`\n[Graph] --- Synthesis node executing... condensing history ---`);
    const agent = agents.find(a => a.name === 'synthesis_agent');
    if (!agent)
        throw new Error('Synthesis agent not found.');
    const events = stateToEvents(state.chatHistory, state.taskWorkspace);
    const bid = { agentName: 'synthesis_agent', confidence: 1.0, proposedAction: 'Synthesise final answer', expectedOutputShape: 'text' };
    const result = await agent.execute(events, bid);
    return {
        chatHistory: [new messages_1.AIMessage(result.content)], // Append the real generated answer
    };
}
async function compactionNode(state) {
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
            const result = await registry.call('groq:llama-3.1-8b-instant', prompt, { temperature: 0.1 });
            if (result.text && !result.text.includes('NONE')) {
                console.log(`[Graph] Saving long-term memory: \n${result.text.trim()}`);
                await toolRegistry.execute({
                    id: 'compaction',
                    name: 'write_memory',
                    arguments: { file: 'USER', content: `Session extracted facts:\n${result.text.trim()}` }
                });
            }
        }
        catch (e) {
            console.error('[Graph] Compaction LLM call failed, skipping:', e.message);
        }
    }
    // WIPE the ephemeral workspace, preventing context rot
    return { taskWorkspace: [] };
}
exports.workflow = new langgraph_1.StateGraph(state_1.AuraStateSchema)
    .addNode('orchestrator', orchestratorNode)
    .addNode('research_agent', specialistNode)
    .addNode('code_agent', specialistNode)
    .addNode('synthesis_agent', synthesisNode)
    .addNode('compaction', compactionNode)
    .addEdge(langgraph_1.START, 'orchestrator');
exports.workflow.addConditionalEdges('orchestrator', (state) => {
    if (state.errorCount >= 3) {
        console.log('[Graph] 🛑 Circuit breaker tripped! Too many consecutive errors. Forcing synthesis fallback.');
        return 'synthesis_agent';
    }
    return state.activeAgent === 'end' ? langgraph_1.END : state.activeAgent;
});
exports.workflow.addEdge('research_agent', 'orchestrator');
exports.workflow.addEdge('code_agent', 'orchestrator');
exports.workflow.addEdge('synthesis_agent', 'compaction');
exports.workflow.addEdge('compaction', langgraph_1.END); // Compaction is the new terminal node
// Phase 5: Checkpointer Integration
// Binding MemorySaver allows the graph to preserve state metadata per thread_id,
// enabling asynchronous resumption and future Human-in-the-loop interrupts.
exports.compiledGraph = exports.workflow.compile({ checkpointer: new langgraph_1.MemorySaver() });
