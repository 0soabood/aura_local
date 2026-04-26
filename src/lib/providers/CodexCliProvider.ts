import { spawn } from 'child_process';
import { ModelProvider, CallOptions, ProviderResult } from './types';

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
export class CodexCliProvider implements ModelProvider {
  readonly id = 'codex';
  readonly supportedModels = ['o4-mini', 'o3', 'o3-mini'];

  async call(model: string, prompt: string, opts: CallOptions = {}): Promise<ProviderResult> {
    const start = Date.now();

    const fullPrompt = opts.systemPrompt
      ? `${opts.systemPrompt}\n\n${prompt}`
      : prompt;

    const text = await this.runCli(model, fullPrompt);

    return {
      text,
      model,
      provider:  this.id,
      tokensIn:  0, // CLI does not expose token counts
      tokensOut: 0,
      latencyMs: Date.now() - start,
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.exec('codex', ['--version']);
      return true;
    } catch {
      return false;
    }
  }

  private runCli(model: string, prompt: string): Promise<string> {
    return this.exec('codex', ['--model', model, '-q', prompt]);
  }

  private exec(cmd: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { shell: false });
      let stdout = '';
      let stderr = '';

      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`[CodexCliProvider] timed out after ${CLI_TIMEOUT_MS}ms`));
      }, CLI_TIMEOUT_MS);

      child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(`[CodexCliProvider] exited ${code}: ${stderr.trim()}`));
        } else {
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
