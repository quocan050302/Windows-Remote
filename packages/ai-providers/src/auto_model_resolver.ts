import type { AiProviderId, AiCapabilityProfile } from '@test-io-agent/shared';

export interface ModelMetadata {
  id: string;
  displayName?: string;
  supportsVision: boolean;
  supportsStructuredOutput: boolean;
  isStable: boolean;
  score: number;
}

/**
 * AutoModelResolver dynamically discovers, ranks, and resolves the best available model
 * for a given AI provider and task capability profile.
 * Eliminates the need for users to know or type technical model IDs.
 */
export class AutoModelResolver {
  /**
   * Pre-ranked internal preference chains for fallback ranking
   */
  private static readonly PREFERRED_MODELS: Record<AiProviderId, string[]> = {
    gemini: [
      'gemini-3.5-flash',
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-flash-latest',
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-3-flash-preview',
      'gemini-3.1-pro-preview'
    ],
    openai: [
      'gpt-4o',
      'gpt-4o-mini',
      'o3-mini',
      'gpt-4-turbo',
      'gpt-3.5-turbo'
    ],
    anthropic: [
      'claude-3-7-sonnet-20250219',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229'
    ],
    ollama: [
      'llama3.2-vision:latest',
      'llama3.2:latest',
      'qwen2.5:latest',
      'qwen2.5:7b',
      'mistral:latest',
      'deepseek-r1:latest',
      'llama3.1:8b',
      'llama3:latest'
    ],
    deterministic: [
      'qa-deterministic-v1'
    ]
  };

  /**
   * Discovers models available from the provider API using active credentials.
   */
  public async discoverModels(
    provider: AiProviderId,
    credentials: { apiKey?: string; baseUrl?: string }
  ): Promise<string[]> {
    if (provider === 'deterministic') {
      return ['qa-deterministic-v1'];
    }

    try {
      if (provider === 'gemini') {
        const key = (credentials.apiKey || process.env.GEMINI_API_KEY || '').trim();
        if (!key) return [];

        const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
          headers: {
            'x-goog-api-key': key
          },
          signal: AbortSignal.timeout(8000)
        });

        if (!res.ok) return [];
        const data = await res.json();
        if (Array.isArray(data.models)) {
          return data.models
            .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
            .map((m: any) => m.name.replace(/^models\//, ''));
        }
      }

      if (provider === 'openai') {
        const key = (credentials.apiKey || process.env.OPENAI_API_KEY || '').trim();
        if (!key) return [];

        const res = await fetch('https://api.openai.com/v1/models', {
          headers: {
            Authorization: `Bearer ${key}`
          },
          signal: AbortSignal.timeout(8000)
        });

        if (!res.ok) return [];
        const data = await res.json();
        if (Array.isArray(data.data)) {
          return data.data
            .map((m: any) => m.id)
            .filter((id: string) => id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('o3'));
        }
      }

      if (provider === 'anthropic') {
        const key = (credentials.apiKey || process.env.ANTHROPIC_API_KEY || '').trim();
        if (!key) return [];

        const res = await fetch('https://api.anthropic.com/v1/models', {
          headers: {
            'x-api-key': key,
            'anthropic-version': '2023-06-01'
          },
          signal: AbortSignal.timeout(8000)
        });

        if (!res.ok) return [];
        const data = await res.json();
        if (Array.isArray(data.data)) {
          return data.data.map((m: any) => m.id);
        }
      }

      if (provider === 'ollama') {
        const baseUrl = (credentials.baseUrl || 'http://127.0.0.1:11434').replace(/\/+$/, '');
        const res = await fetch(`${baseUrl}/api/tags`, {
          signal: AbortSignal.timeout(5000)
        });

        if (!res.ok) return [];
        const data = await res.json();
        if (Array.isArray(data.models)) {
          return data.models.map((m: any) => m.name);
        }
      }
    } catch (err: any) {
      console.warn(`[AutoModelResolver] Live discovery failed for ${provider}:`, err.message);
    }

    // Fallback to internal preference list if network discovery fails
    return AutoModelResolver.PREFERRED_MODELS[provider] || [];
  }

  /**
   * Filters models based on capability requirements
   */
  public filterCompatibleModels(
    models: string[],
    profile: AiCapabilityProfile = 'BROWSER_AGENT'
  ): string[] {
    if (!models || models.length === 0) return [];

    return models.filter((m) => {
      const lower = m.toLowerCase();
      // Exclude audio/tts/embedding/moderation/dall-e/whisper models from browser reasoning
      if (
        lower.includes('tts') ||
        lower.includes('embedding') ||
        lower.includes('clip') ||
        lower.includes('moderation') ||
        lower.includes('whisper') ||
        lower.includes('dall-e') ||
        lower.includes('realtime')
      ) {
        return false;
      }

      if (profile === 'VISION_QA' || profile === 'BROWSER_AGENT') {
        // Models known to lack chat reasoning or vision can be filtered
        if (lower.includes('text-search') || lower.includes('babbage') || lower.includes('davinci')) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Ranks candidates by stability, capabilities and benchmark preference
   */
  public rankModels(
    provider: AiProviderId,
    candidates: string[],
    profile: AiCapabilityProfile = 'BROWSER_AGENT'
  ): string[] {
    const preferences = AutoModelResolver.PREFERRED_MODELS[provider] || [];

    const scored = candidates.map((candidate) => {
      let score = 0;
      const lower = candidate.toLowerCase();

      // Preference index rank bonus (earlier in preference chain gets higher bonus)
      const prefIndex = preferences.indexOf(candidate);
      if (prefIndex !== -1) {
        score += (preferences.length - prefIndex) * 20;
      }

      // Stability bonus: avoid preview/experimental if stable exists
      if (!lower.includes('preview') && !lower.includes('exp') && !lower.includes('beta')) {
        score += 15;
      }

      // Fast flash / mini models ideal for iterative browser steps
      if (lower.includes('flash') || lower.includes('mini') || lower.includes('haiku')) {
        score += 10;
      }

      // Vision capabilities
      if (lower.includes('vision')) {
        score += profile === 'VISION_QA' || profile === 'BROWSER_AGENT' ? 15 : 5;
      }

      return { candidate, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.candidate);
  }

  /**
   * Selects the single best model for a provider
   */
  public selectBestModel(
    provider: AiProviderId,
    candidates: string[],
    profile: AiCapabilityProfile = 'BROWSER_AGENT'
  ): string {
    if (provider === 'deterministic') {
      return 'qa-deterministic-v1';
    }

    const filtered = this.filterCompatibleModels(candidates, profile);
    const ranked = this.rankModels(provider, filtered.length > 0 ? filtered : candidates, profile);

    if (ranked.length > 0) {
      return ranked[0];
    }

    // Default fallback from known stable chain
    return AutoModelResolver.PREFERRED_MODELS[provider]?.[0] || 'qa-deterministic-v1';
  }
}

export const defaultAutoModelResolver = new AutoModelResolver();
