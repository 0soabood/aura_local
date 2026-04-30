import { GoogleGenAI } from '@google/genai';
import { ModelProvider, CallOptions, ProviderResult } from './types';
import path from 'path';

export class VertexProvider implements ModelProvider {
  readonly id = 'vertex';
  readonly supportedModels = [
    'gemini-2.5-flash',
    'gemini-2.5-pro',
    'gemini-2.0-flash',
    'gemini-2.0-pro',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
  ];

  private getProjectId(): string {
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    if (!project) throw new Error('[VertexProvider] GOOGLE_CLOUD_PROJECT not set');
    return project;
  }

  private getLocation(): string {
    return process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1';
  }

  private getCredentialsPath(): string | undefined {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credPath) return undefined;
    
    // Resolve relative paths from project root
    if (!path.isAbsolute(credPath)) {
      return path.resolve(process.cwd(), credPath);
    }
    return credPath;
  }

  async call(model: string, prompt: string, opts: CallOptions = {}): Promise<ProviderResult> {
    const project = this.getProjectId();
    const location = this.getLocation();
    const credPath = this.getCredentialsPath();

    const start = Date.now();

    try {
      // Initialize with explicit credentials if provided
      const ai = credPath
        ? new GoogleGenAI({ 
            vertexai: true, 
            project, 
            location,
            googleAuthOptions: {
              keyFile: credPath
            }
          } as any)
        : new GoogleGenAI({ vertexai: true, project, location } as any);

      const fullPrompt = opts?.systemPrompt
        ? opts.systemPrompt + '\n\n---\n\n' + prompt
        : prompt;

      const response = await ai.models.generateContent({
        model,
        contents: fullPrompt,
        config: {
          temperature: opts.temperature ?? 0.2,
          ...(opts.maxTokens ? { maxOutputTokens: opts.maxTokens } : {}),
        },
      });

      return {
        text: response.text ?? '',
        model,
        provider: this.id,
        tokensIn: response.usageMetadata?.promptTokenCount ?? 0,
        tokensOut: response.usageMetadata?.candidatesTokenCount ?? 0,
        latencyMs: Date.now() - start,
      };
    } catch (err: any) {
      // Check for rate limiting
      const is429 = err?.status === 429 || err?.code === 429 ||
        (typeof err?.message === 'string' && err.message.includes('RESOURCE_EXHAUSTED'));
      
      if (is429) {
        return {
          text: '',
          model,
          provider: this.id,
          tokensIn: 0,
          tokensOut: 0,
          latencyMs: Date.now() - start,
          rateLimited: true,
          errorMessage: 'Vertex AI rate limit exceeded',
        };
      }

      throw err;
    }
  }

  async isAvailable(): Promise<boolean> {
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    if (!project) return false;

    // Optionally validate credentials path exists
    const credPath = this.getCredentialsPath();
    if (credPath) {
      try {
        const fs = await import('fs');
        return fs.existsSync(credPath);
      } catch {
        // If we can't check, assume it might work (ADC might still work)
        return true;
      }
    }

    return true; // ADC might work without explicit credentials
  }
}
