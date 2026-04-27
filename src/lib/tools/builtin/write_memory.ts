import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ToolDefinition, ToolFn } from '../types';
import { reloadAuraMemory } from '../../memory/loader';

const MEMORY_DIR = path.join(os.homedir(), '.aura', 'memory');
const ALLOWED: readonly string[] = ['SOUL', 'USER', 'AGENTS'];

export const writeMemoryDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'write_memory',
    description:
      'Append new content to one of the AURA persistent memory files. ' +
      'Use to save user preferences, facts, or session summaries for future sessions. ' +
      'Allowed files: SOUL (identity), USER (user context), AGENTS (agent config).',
    parameters: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          description: 'Which memory file to append to: "SOUL", "USER", or "AGENTS".',
        },
        content: {
          type: 'string',
          description: 'Markdown content to append. Be concise and factual.',
        },
      },
      required: ['file', 'content'],
      additionalProperties: false,
    },
  },
};

export const writeMemoryFn: ToolFn = async (args) => {
  const file = String(args.file ?? '').toUpperCase().trim();
  if (!ALLOWED.includes(file)) {
    return `Error: Invalid memory file "${file}". Allowed: ${ALLOWED.join(', ')}`;
  }

  const content = String(args.content ?? '').trim();
  if (!content) return 'Error: content cannot be empty.';

  const filePath = path.join(MEMORY_DIR, `${file}.md`);
  try {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
    const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
    const separator = existing && !existing.endsWith('\n') ? '\n\n' : '\n';
    fs.writeFileSync(filePath, `${existing}${separator}${content}\n`, 'utf-8');
    reloadAuraMemory();
    return `Appended to ${file}.md successfully.`;
  } catch (err: any) {
    return `Error writing to ${file}.md: ${err.message}`;
  }
};
