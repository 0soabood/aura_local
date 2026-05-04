import { callProvider, CallerMessage, CallerResult, ProviderFormat } from './UnifiedCaller';
import { ModelConfig, ProviderConfig } from './ProviderRegistry';

/**
 * OpenRouter Provider - Dynamic model discovery
 *
 * OpenRouter provides access to 500+ models from 50+ providers through a single API.
 * This provider dynamically fetches the available models instead of hardcoding them.
 */

export interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  pricing?: {
    prompt: string;
    completion: string;
  };
  architecture?: {
    modality: string;
    input_modalities: string[];
  };
  top_provider?: {
    is_moderated: boolean;
  };
}

export interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

/**
 * Fetch available models from OpenRouter API
 * Returns a formatted list of ModelConfig objects
 */
export async function fetchOpenRouterModels(apiKey: string): Promise<ModelConfig[]> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`[OpenRouter] Failed to fetch models: ${response.status} ${response.statusText}`);
      return getFallbackModels();
    }

    const data: OpenRouterModelsResponse = await response.json();

    if (!data.data || !Array.isArray(data.data)) {
      console.error('[OpenRouter] Invalid response format from models API');
      return getFallbackModels();
    }

    // Convert OpenRouter models to our ModelConfig format
    const models: ModelConfig[] = data.data
      .filter(model => model.id && model.name) // Filter out invalid entries
      .map(model => ({
        id: model.id,
        name: model.name,
        free: isFreeModel(model),
        rpm: getRPMForModel(model),
        contextWindow: model.context_length || 131072,
        notes: generateNotes(model),
      }))
      .sort((a, b) => {
        // Sort: free models first, then by name
        if (a.free && !b.free) return -1;
        if (!a.free && b.free) return 1;
        return a.name.localeCompare(b.name);
      });

    console.log(`[OpenRouter] Fetched ${models.length} models from API`);
    return models.length > 0 ? models : getFallbackModels();

  } catch (error) {
    console.error('[OpenRouter] Error fetching models:', error);
    return getFallbackModels();
  }
}

/**
 * Determine if a model is free based on its pricing or ID
 */
function isFreeModel(model: OpenRouterModel): boolean {
  // Check pricing
  if (model.pricing) {
    const promptPrice = parseFloat(model.pricing.prompt || '0');
    const completionPrice = parseFloat(model.pricing.completion || '0');
    if (promptPrice === 0 && completionPrice === 0) return true;
  }

  // Check if ID contains ':free' suffix
  if (model.id.endsWith(':free')) return true;

  return false;
}

/**
 * Get RPM based on model characteristics
 */
function getRPMForModel(model: OpenRouterModel): number {
  // Free models typically have 20 RPM limit
  if (isFreeModel(model)) return 20;

  // Paid models typically have higher limits
  // OpenRouter paid tier: 500+ RPM depending on model
  if (model.id.includes('claude')) return 30;
  if (model.id.includes('gpt-4')) return 30;
  if (model.id.includes('gemini')) return 60;

  return 60; // Default for paid models
}

/**
 * Generate notes for a model
 */
function generateNotes(model: OpenRouterModel): string | undefined {
  const parts: string[] = [];

  if (isFreeModel(model)) {
    parts.push('Free tier');
  }

  if (model.pricing) {
    const promptPrice = parseFloat(model.pricing.prompt || '0');
    if (promptPrice > 0) {
      parts.push(`$${promptPrice}/1K tokens`);
    }
  }

  if (model.top_provider?.is_moderated) {
    parts.push('Moderated');
  }

  return parts.length > 0 ? parts.join('; ') : undefined;
}

/**
 * Fallback models if API fetch fails
 */
function getFallbackModels(): ModelConfig[] {
  return [
    {
      id: 'meta-llama/llama-3.3-70b-instruct:free',
      name: 'Llama 3.3 70B Instruct (Free)',
      free: true,
      rpm: 20,
      contextWindow: 131072,
      notes: 'Popular free model; default fallback',
    },
    {
      id: 'google/gemini-2.5-flash:free',
      name: 'Gemini 2.5 Flash (Free)',
      free: true,
      rpm: 20,
      contextWindow: 1048576,
      notes: 'Google Gemini via OpenRouter',
    },
    {
      id: 'deepseek/deepseek-v3:free',
      name: 'DeepSeek V3 (Free)',
      free: true,
      rpm: 20,
      contextWindow: 131072,
      notes: 'DeepSeek V3 via OpenRouter',
    },
    {
      id: 'anthropic/claude-3.7-sonnet',
      name: 'Claude 3.7 Sonnet (Paid)',
      free: false,
      rpm: 30,
      contextWindow: 200000,
      notes: 'Anthropic Claude via OpenRouter',
    },
  ];
}

/**
 * Create a dynamic ProviderConfig for OpenRouter with live model fetching
 */
export async function createOpenRouterProvider(): Promise<ProviderConfig> {
  const apiKey = process.env.OPENROUTER_API_KEY || '';
  const defaultModel = 'meta-llama/llama-3.3-70b-instruct:free';

  // Fetch models dynamically
  const models = apiKey
    ? await fetchOpenRouterModels(apiKey)
    : getFallbackModels();

  return {
    id: 'openrouter',
    envKey: 'OPENROUTER_API_KEY',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: models.find(m => m.free)?.id || defaultModel,
    rpm: 20, // Default RPM for free tier
    format: 'openai',
    models,
    notes: `OpenRouter provides 500+ models from 50+ providers. ${models.length} models currently available. Full list: https://openrouter.ai/models`,
  };
}

/**
 * Synchronous version that uses fallback models initially
 * The ProviderRegistry can call fetchOpenRouterModels asynchronously to update
 */
export function getOpenRouterProviderSync(): ProviderConfig {
  const defaultModel = 'meta-llama/llama-3.3-70b-instruct:free';

  return {
    id: 'openrouter',
    envKey: 'OPENROUTER_API_KEY',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel,
    rpm: 20,
    format: 'openai',
    models: getFallbackModels(), // Will be updated asynchronously
    notes: 'OpenRouter supports 500+ models across 50+ providers. Models will be fetched dynamically when API key is available.',
  };
}
