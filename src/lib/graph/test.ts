import { config } from 'dotenv';
config({ path: '.env.local' }); // Load API keys for the standalone test

import { HumanMessage } from '@langchain/core/messages';
import { compiledGraph, checkpointer } from './workflow';

async function runTest() {
  console.log('--- Starting LangGraph Prototype ---');
  
  // Inject a code-related message to trigger the code agent
  const initialState = {
    chatHistory: [],
    taskWorkspace: [new HumanMessage('Can you write a typescript function for me?')],
    errorCount: 0,
    activeAgent: 'orchestrator'
  };

  const config = { configurable: { thread_id: 'test-session-1' } };
  const result = await compiledGraph.invoke(initialState, config);
  
  console.log('\n--- Final State Validation ---');
  console.log('Chat History (Persistent) Length:', result.chatHistory.length);
  console.log('Chat History Content:', result.chatHistory.map((m: any) => m.content));
  console.log('Task Workspace (Ephemeral) Length:', result.taskWorkspace.length);
  console.log('Task Workspace Content:', result.taskWorkspace.map((m: any) => m.content));
}

runTest().catch(console.error);