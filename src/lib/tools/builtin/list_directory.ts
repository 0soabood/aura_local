import * as fs from 'fs';
import * as path from 'path';
import type { ToolDefinition, ToolFn } from '../types';

const PROJECT_ROOT = process.cwd();

export const listDirectoryDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'list_directory',
    description:
      'List files and directories at a path inside the project. ' +
      'Use "." for the project root. Non-recursive.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative directory path from the project root.' },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
};

export const listDirectoryFn: ToolFn = async (args) => {
  const relativePath = String(args.path ?? '.').trim() || '.';
  const resolved = path.resolve(PROJECT_ROOT, relativePath);

  if (!resolved.startsWith(PROJECT_ROOT + path.sep) && resolved !== PROJECT_ROOT) {
    return `Error: Path "${relativePath}" escapes the project root.`;
  }

  if (!fs.existsSync(resolved)) return `Error: Directory not found: ${relativePath}`;

  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    return `Error: "${relativePath}" is a file — use read_file instead.`;
  }

  const entries = fs.readdirSync(resolved, { withFileTypes: true });
  const lines = entries.map(e => `${e.isDirectory() ? '[dir] ' : '[file]'} ${e.name}`);
  return `Contents of ${relativePath}:\n${lines.join('\n')}`;
};
