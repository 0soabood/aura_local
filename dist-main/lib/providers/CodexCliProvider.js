"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodexCliProvider = void 0;
const child_process_1 = require("child_process");
const CLI_TIMEOUT_MS = 120_000;
/**
 * CodexCliProvider — shells out to the `codex` CLI (openai/codex).
 *
 * Best suited for: code generation, debugging, refactoring, explanation.
 * Requires `codex` to be installed globally and OPENAI_API_KEY to be set
 * in the environment (the CLI reads it directly).
 *
 * Supported models (passed via --model):
 *   codex:o4-mini  — fast, low cost, strong at code
 *   codex:o3       — highest quality reasoning
 */
class CodexCliProvider {
    constructor() {
        this.id = 'codex';
        this.supportedModels = ['o4-mini', 'o3', 'o3-mini'];
    }
    async call(model, prompt, opts = {}) {
        const start = Date.now();
        const fullPrompt = opts.systemPrompt
            ? `${opts.systemPrompt}\n\n${prompt}`
            : prompt;
        const text = await this.runCli(model, fullPrompt);
        return {
            text,
            model,
            provider: this.id,
            tokensIn: 0, // CLI does not expose token counts
            tokensOut: 0,
            latencyMs: Date.now() - start,
        };
    }
    async isAvailable() {
        try {
            await this.exec('codex', ['--version']);
            return true;
        }
        catch {
            return false;
        }
    }
    runCli(model, prompt) {
        return this.exec('codex', ['--model', model, '-q', prompt]);
    }
    exec(cmd, args) {
        return new Promise((resolve, reject) => {
            const child = (0, child_process_1.spawn)(cmd, args, { shell: false });
            let stdout = '';
            let stderr = '';
            const timer = setTimeout(() => {
                child.kill('SIGTERM');
                reject(new Error(`[CodexCliProvider] timed out after ${CLI_TIMEOUT_MS}ms`));
            }, CLI_TIMEOUT_MS);
            child.stdout.on('data', (d) => { stdout += d.toString(); });
            child.stderr.on('data', (d) => { stderr += d.toString(); });
            child.on('close', (code) => {
                clearTimeout(timer);
                if (code !== 0) {
                    reject(new Error(`[CodexCliProvider] exited ${code}: ${stderr.trim()}`));
                }
                else {
                    resolve(stdout.trim());
                }
            });
            child.on('error', (err) => {
                clearTimeout(timer);
                reject(new Error(`[CodexCliProvider] spawn error: ${err.message}`));
            });
        });
    }
}
exports.CodexCliProvider = CodexCliProvider;
