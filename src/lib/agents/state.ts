import { BaseMessage } from '@langchain/core/messages';
import { Annotation } from '@langchain/langgraph';

/**
 * Core LangGraph state schema for AURA.
 */
export const AuraStateSchema = Annotation.Root({
  chatHistory: Annotation<BaseMessage[]>({
    reducer: (currentState, updateValue) => currentState.concat(updateValue),
    default: () => [],
  }),
  taskWorkspace: Annotation<BaseMessage[]>({
    reducer: (currentState, updateValue) => updateValue, // Overwrite reducer (we spread in the nodes to accumulate)
    default: () => [],
  }),
  activeAgent: Annotation<string>({
    reducer: (currentState, updateValue) => updateValue,
    default: () => 'orchestrator',
  }),
  errorCount: Annotation<number>({
    reducer: (currentState, updateValue) => currentState + updateValue,
    default: () => 0,
  }),
});