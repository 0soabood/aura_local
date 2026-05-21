import { ModelConfig, ProviderConfig } from './ProviderRegistry';
import { resolveKey } from './ByokStore';

/**
 * Groq Provider — Ultra-fast inference with live model discovery
 *
 * Groq provides sub-100ms latency for open-source models.
 * Models are fetched dynamically from the Groq API.
 */

export interface GroqModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  active: boolean;
  context_window: number;
  max_completion_tokens: number;
}

export interface GroqModelsResponse {
  object: string;
  data: GroqModel[];
}

/**
 * Fetch available models from Groq API
 */
export async function fetchGroqModels(apiKey: string): Promise<ModelConfig[]> {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`[Groq] Failed to fetch models: ${response.status} ${response.statusText}`);
      return getFallbackModels();
    }

    const data: GroqModelsResponse = await response.json();

    if (!data.data || !Array.isArray(data.data)) {
      console.error('[Groq] Invalid response format from models API');
      return getFallbackModels();
    }

    // Only include active models
    const models: ModelConfig[] = data.data
      .filter(model => model.active && model.id && model.context_window > 0)
      // Filter out non-text models (whisper, prompt-guard, etc.)
      .filter(model => {
        const skip = ['whisper', 'prompt-guard', 'safeguard', 'orpheus', 'compound'];
        return !skip.some(s => model.id.includes(s));
      })
      .map(model => ({
        id: model.id,
        name: formatModelName(model),
        free: isFreeModel(model),
        rpm: getRPMForModel(model),
        contextWindow: model.context_window,
        notes: `${model.owned_by} · ${model.max_completion_tokens} max output`,
      }))
      .sort((a, b) => {
        // Free models first, then by name
        if (a.free && !b.free) return -1;
        if (!a.free && b.free) return 1;
        return a.name.localeCompare(b.name);
      });

    console.log(`[Groq] Fetched ${models.length} models from API`);
    return models.length > 0 ? models : getFallbackModels();

  } catch (error) {
    console.error('[Groq] Error fetching models:', error);
    return getFallbackModels();
  }
}

/**
 * Format a human-readable model name from Groq metadata
 */
function formatModelName(model: GroqModel): string {
  // Map common Groq model IDs to readable names
  const nameMap: Record<string, string> = {
    'llama-3.1-8b-instant': 'Llama 3.1 8B Instant',
    'llama-3.3-70b-versatile': 'Llama 3.3 70B Versatile',
    'qwen/qwen3-32b': 'Qwen 3 32B',
    'openai/gpt-oss-20b': 'GPT-OSS 20B',
    'openai/gpt-oss-120b': 'GPT-OSS 120B',
    'allam-2-7b': 'Allam 2 7B',
    'meta-llama/llama-4-scout-17b-16e-instruct': 'Llama 4 Scout 17B 16E',
  };

  const mapped = nameMap[model.id];
  if (mapped) return `${model.owned_by}: ${mapped}`;

  // Generic: "Owner: Model ID"
  return `${model.owned_by}: ${model.id}`;
}

/**
 * Determine if a model is free (Groq has generous free tiers)
 */
function isFreeModel(_model: GroqModel): boolean {
  // Most Groq models have free tiers
  return true;
}

/**
 * Get RPM for a model (Groq is known for high throughput)
 */
function getRPMForModel(model: GroqModel): number {
  // Groq has very high RPM limits
  if (model.id.includes('70b') || model.id.includes('120b')) return 30;
  if (model.id.includes('32b') || model.id.includes('8b')) return 60;
  return 50; // Default
}

/**
 * Fallback models if API fetch fails
 */
function getFallbackModels(): ModelConfig[] {
  return [
    {
      id: 'llama-3.3-70b-versatile',
      name: 'Meta: Llama 3.3 70B Versatile',
      free: true,
      rpm: 30,
      contextWindow: 131072,
      notes: 'Groq default — fast 70B model',
    },
    {
      id: 'llama-3.1-8b-instant',
      name: 'Meta: Llama 3.1 8B Instant',
      free: true,
      rpm: 60,
      contextWindow: 131072,
      notes: 'Ultra-fast 8B model',
    },
    {
      id: 'qwen/qwen3-32b',
      name: 'Alibaba Cloud: Qwen 3 32B',
      free: true,
      rpm: 50,
      contextWindow: 131072,
      notes: 'Qwen 3 on Groq',
    },
  ];
}

/**
 * Create a dynamic ProviderConfig for Groq with live model fetching
 */
export async function createGroqProvider(): Promise<ProviderConfig> {
  const apiKey = resolveKey('groq', 'GROQ_API_KEY');
  const defaultModel = 'llama-3.3-70b-versatile';

  // Fetch models dynamically
  const models = apiKey
    ? await fetchGroqModels(apiKey)
    : getFallbackModels();

  return {
    id: 'groq',
    envKey: 'GROQ_API_KEY',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: models.find(m => m.free)?.id || defaultModel,
    rpm: 30,
    format: 'openai',
    models,
    notes: `Groq provides ultra-fast inference for open-source models. ${models.length} models currently available.`,
  };
}

/**
 * Synchronous version for initial config
 */
export function getGroqProviderSync(): ProviderConfig {
  const defaultModel = 'llama-3.3-70b-versatile';

  return {
    id: 'groq',
    envKey: 'GROQ_API_KEY',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel,
    rpm: 30,
    format: 'openai',
    models: getFallbackModels(),
    notes: 'Groq ultra-fast inference. Models fetched dynamically when API key is available.',
  };
}
