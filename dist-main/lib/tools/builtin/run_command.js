"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCommandFn = exports.runCommandDef = exports._internals = exports.ALLOWED_PREFIXES = void 0;
exports.isAllowed = isAllowed;
const child_process_1 = require("child_process");
const PROJECT_ROOT = process.cwd();
const MAX_OUTPUT_CHARS = 3000;
exports.ALLOWED_PREFIXES = [
    'npm test',
    'npm run test',
    'npm run build',
    'npm run lint',
    'tsc --noEmit',
    'git diff',
    'git status',
    'git add',
    'git commit -m',
];
function isAllowed(command) {
    const trimmed = command.trim();
    return exports.ALLOWED_PREFIXES.some(prefix => trimmed === prefix || trimmed.startsWith(prefix + ' '));
}
/**
 * Thin wrapper around execSync — exported so tests can replace it
 * without needing to mock the entire child_process built-in module.
 */
exports._internals = {
    exec: (command, opts) => (0, child_process_1.execSync)(command, opts),
};
exports.runCommandDef = {
    type: 'function',
    function: {
        name: 'run_command',
        description: 'Run a whitelisted shell command from the project root and return its output. ' +
            'Allowed commands: npm test, npm run build, npm run lint, tsc --noEmit, ' +
            'git diff, git status, git add, git commit -m "...".',
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
const runCommandFn = async (args) => {
    const command = String(args.command ?? '').trim();
    if (!command)
        return 'Error: command must be a non-empty string.';
    if (!isAllowed(command)) {
        return `Error: Command not permitted: "${command}". ` +
            `Allowed prefixes: ${exports.ALLOWED_PREFIXES.join(', ')}`;
    }
    try {
        const output = exports._internals.exec(command, {
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
    }
    catch (err) {
        const stdout = (err.stdout ?? '').trim();
        const stderr = (err.stderr ?? '').trim();
        const combined = [stdout, stderr].filter(Boolean).join('\n').slice(0, MAX_OUTPUT_CHARS);
        return `Exit code ${err.status ?? 1}:\n${combined || err.message}`;
    }
};
exports.runCommandFn = runCommandFn;
