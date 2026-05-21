import { execSync } from 'child_process';
import type { ToolDefinition, ToolFn } from '../types';

const PROJECT_ROOT = process.cwd();
const MAX_OUTPUT_CHARS = 3000;

export const ALLOWED_PREFIXES = [
  'npm test',
  'npm run test',
  'npm run build',
  'npm run lint',
  'tsc --noEmit',
  'git diff',
  'git status',
];

export function isAllowed(command: string): boolean {
  const trimmed = command.trim();
  return ALLOWED_PREFIXES.some(prefix => trimmed === prefix || trimmed.startsWith(prefix + ' '));
}

/**
 * Thin wrapper around execSync — exported so tests can replace it
 * without needing to mock the entire child_process built-in module.
 */
export const _internals = {
  exec: (command: string, opts: Parameters<typeof execSync>[1]) =>
    execSync(command, opts) as string,
};

export const runCommandDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'run_command',
    description:
      'Run a whitelisted shell command from the project root and return its output. ' +
      'Allowed commands: npm test, npm run build, npm run lint, tsc --noEmit, ' +
      'git diff, git status.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The exact shell command to run.' },
      },
      required: ['command'],
      additionalProperties: false,
    },
  },
};

export const runCommandFn: ToolFn = async (args) => {
  const command = String(args.command ?? '').trim();
  if (!command) return 'Error: command must be a non-empty string.';

  if (!isAllowed(command)) {
    return `Error: Command not permitted: "${command}". ` +
      `Allowed prefixes: ${ALLOWED_PREFIXES.join(', ')}`;
  }

  try {
    const output = _internals.exec(command, {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      timeout: 60000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const trimmed = output.trim();
    if (trimmed.length > MAX_OUTPUT_CHARS) {
      return trimmed.slice(0, MAX_OUTPUT_CHARS) + `\n\n[Truncated — ${trimmed.length} chars total]`;
    }
    return trimmed || '(no output)';
  } catch (err: any) {
    const stdout = (err.stdout ?? '').trim();
    const stderr = (err.stderr ?? '').trim();
    const combined = [stdout, stderr].filter(Boolean).join('\n').slice(0, MAX_OUTPUT_CHARS);
    return `Exit code ${err.status ?? 1}:\n${combined || err.message}`;
  }
};
