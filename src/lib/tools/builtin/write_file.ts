import * as fs from 'fs';
import * as path from 'path';
import type { ToolDefinition, ToolFn } from '../types';

const PROJECT_ROOT = process.cwd();

export const writeFileDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'write_file',
    description:
      'Write content to a file in the project, creating it (and any parent directories) if needed. ' +
      'Path must be relative to the project root. Overwrites existing content.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative file path from the project root.' },
        content: { type: 'string', description: 'Content to write to the file.' },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
  },
};

export const writeFileFn: ToolFn = async (args) => {
  const relativePath = String(args.path ?? '').trim();
  if (!relativePath) return 'Error: path must be a non-empty string.';

  const content = String(args.content ?? '');

  const resolved = path.resolve(PROJECT_ROOT, relativePath);
  if (!resolved.startsWith(PROJECT_ROOT + path.sep) && resolved !== PROJECT_ROOT) {
    return `Error: Path "${relativePath}" escapes the project root.`;
  }

  const dir = path.dirname(resolved);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolved, content, 'utf-8');

  return `Written: ${relativePath} (${Buffer.byteLength(content, 'utf-8')} bytes)`;
};
