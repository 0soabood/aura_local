import { GoogleGenAI } from '@google/genai';
import { ModelProvider, CallOptions, ProviderResult } from './types';

export class GeminiProvider implements ModelProvider {
  readonly id = 'gemini';
  readonly supportedModels = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.5-pro',
  ];

  async call(model: string, prompt: string, opts: CallOptions = {}): Promise<ProviderResult> {
    const project = process.env.GOOGLE_CLOUD_PROJECT ?? '';
    if (!project) throw new Error('[GeminiProvider] GOOGLE_CLOUD_PROJECT not set');

    const location = process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1';

    // vertexai: true switches the SDK to Vertex AI endpoints and uses
    // Application Default Credentials (ADC) automatically via google-auth-library.
    // Set GOOGLE_APPLICATION_CREDENTIALS for a service account; otherwise gcloud
    // user credentials or the GCE metadata server are used.
    const ai = new GoogleGenAI({ vertexai: true, project, location });
    const start = Date.now();

    const fullPrompt = opts.systemPrompt
      ? `${opts.systemPrompt}\n\n---\n\n${prompt}`
      : prompt;

    let response: Awaited<ReturnType<typeof ai.models.generateContent>>;
    try {
      response = await ai.models.generateContent({
        model,
        contents: fullPrompt,
        config: {
          temperature: opts.temperature ?? 0.2,
          ...(opts.maxTokens ? { maxOutputTokens: opts.maxTokens } : {}),
        },
      });
    } catch (err: any) {
      // Detect HTTP 429 / RESOURCE_EXHAUSTED from the Google GenAI SDK.
      // The SDK may surface status as err.status, err.code, or embed the raw
      // JSON body in err.message when the HTTP layer is responsible.
      let is429 = err?.status === 429 || err?.code === 429;
      let errorBody: any = null;

      if (!is429 && typeof err?.message === 'string') {
        try {
          errorBody = JSON.parse(err.message);
          is429 =
            errorBody?.error?.code === 429 ||
            errorBody?.error?.status === 'RESOURCE_EXHAUSTED';
        } catch {
          // message is not JSON — fall through to rethrow
        }
      }

      if (is429) {
        const details: any[] =
          errorBody?.error?.details ?? err?.errorDetails ?? [];
        const retryInfo = details.find(
          (d: any) => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo',
        );
        // retryDelay is a proto Duration string, e.g. "60s"
        const retrySeconds =
          retryInfo?.retryDelay !== undefined
            ? parseInt(String(retryInfo.retryDelay).replace(/[^0-9]/g, ''), 10)
            : undefined;
        const validRetry =
          retrySeconds !== undefined && !isNaN(retrySeconds) ? retrySeconds : undefined;

        return {
          text:              '',
          model,
          provider:          this.id,
          tokensIn:          0,
          tokensOut:         0,
          latencyMs:         Date.now() - start,
          rateLimited:       true,
          retryAfterSeconds: validRetry,
          errorMessage:      validRetry
            ? `Gemini API rate limit exceeded. Retry after ${validRetry}s.`
            : 'Gemini API rate limit exceeded.',
        };
      }

      throw err;
    }

    return {
      text:      response.text ?? '',
      model,
      provider:  this.id,
      tokensIn:  response.usageMetadata?.promptTokenCount     ?? 0,
      tokensOut: response.usageMetadata?.candidatesTokenCount ?? 0,
      latencyMs: Date.now() - start,
    };
  }

  async isAvailable(): Promise<boolean> {
    return !!process.env.GOOGLE_CLOUD_PROJECT;
  }
}
