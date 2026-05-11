import {
  getSynthesisPrompt,
  getCodePrompt,
  getResearchPrompt,
  getSystemPrompt,
  PromptContext
} from './PromptAssembler';

export function buildSynthesisPrompt(opts: Partial<PromptContext> = {}): string {
  return getSynthesisPrompt(opts);
}

export function buildCodePrompt(opts: Partial<PromptContext> = {}): string {
  return getCodePrompt({ ...opts, hasMemoryAccess: true });
}

export function buildResearchPrompt(opts: Partial<PromptContext> = {}): string {
  return getResearchPrompt({ ...opts, hasMemoryAccess: true });
}

export function buildSupervisorPrompt(opts: Partial<PromptContext> = {}): string {
  return getSystemPrompt('supervisor_agent', { ...opts, activeMode: 'planning', hasMemoryAccess: true });
}