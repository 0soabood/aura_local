import * as fs from 'fs';
import * as path from 'path';
import type { ToolDefinition, ToolFn } from '../types';

const MAX_CHARS = 4000;
const PROJECT_ROOT = process.cwd();

export const readFileDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'read_file',
    description:
      'Read the contents of a file in the project. ' +
      'Path must be relative to the project root. ' +
      'Returns up to 4000 characters; longer files are truncated.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative file path from the project root.' },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
};

export const readFileFn: ToolFn = async (args) => {
  const relativePath = String(args.path ?? '').trim();
  if (!relativePath) return 'Error: path must be a non-empty string.';

  const resolved = path.resolve(PROJECT_ROOT, relativePath);
  if (!resolved.startsWith(PROJECT_ROOT + path.sep) && resolved !== PROJECT_ROOT) {
    return `Error: Path "${relativePath}" escapes the project root.`;
  }

  if (!fs.existsSync(resolved)) return `Error: File not found: ${relativePath}`;

  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    return `Error: "${relativePath}" is a directory — use list_directory instead.`;
  }

  const content = fs.readFileSync(resolved, 'utf-8');
  if (content.length > MAX_CHARS) {
    return `${content.slice(0, MAX_CHARS)}\n\n[Truncated — ${content.length} chars total, showing first ${MAX_CHARS}]`;
  }
  return content;
};
