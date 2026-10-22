import type {
  AiProviderId,
  ProviderConnectionStatus,
  ActiveAiRuntime
} from '@test-io-agent/shared';
import {
  AiProvider,
  createAiProvider,
  DeterministicQaProvider
} from '@test-io-agent/ai-providers';

export interface ProviderConfiguration {
  providerId: AiProviderId;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
}

export type ProviderConfigResolver = () => Promise<ProviderConfiguration>;

/**
 * AiRuntimeManager oversees AI reasoning engine instances for the Agent Studio.
 * It ensures:
 * 1. The verified provider and auto-selected model from Settings are initialized.
 * 2. Each execution run locks its provider instance for the lifecycle of that run.
 * 3. Settings updates do not disrupt in-flight runs.
 * 4. Sanitized runtime status is accessible to Dashboard, Workspace, and logs without exposing credentials.
 */
export class AiRuntimeManager {
  private runLocks = new Map<string, AiProvider>();
  private runModelIds = new Map<string, string>();
  private currentProvider: AiProvider;
  private currentConfig: ProviderConfiguration;

  constructor(
    private configResolver?: ProviderConfigResolver,
    initialProviderType: string = 'deterministic',
    initialConfig?: any
  ) {
    this.currentConfig = {
      providerId: (initialProviderType as AiProviderId) || 'deterministic',
      modelId: initialConfig?.model || 'qa-deterministic-v1'
    };
    this.currentProvider = createAiProvider(this.currentConfig.providerId, initialConfig);
  }

  /**
   * Refreshes the active AI provider by querying the configuration resolver (SettingsService).
   */
  public async syncWithSettings(): Promise<AiProvider> {
    if (!this.configResolver) {
      return this.currentProvider;
    }

    try {
      const config = await this.configResolver();
      if (!config || !config.providerId) return this.currentProvider;

      this.currentConfig = config;
      this.currentProvider = createAiProvider(config.providerId, {
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.modelId
      });
      return this.currentProvider;
    } catch (err: any) {
      console.warn('[AiRuntimeManager] Failed to sync settings, retaining current provider:', err.message);
      return this.currentProvider;
    }
  }

  /**
   * Directly sets the active provider and model
   */
  public setProvider(providerId: AiProviderId, config?: { apiKey?: string; baseUrl?: string; model?: string }): void {
    const model = config?.model || (providerId === 'gemini' ? 'gemini-3.5-flash' : providerId === 'anthropic' ? 'claude-3-7-sonnet-20250219' : 'qa-deterministic-v1');
    this.currentConfig = {
      providerId,
      modelId: model,
      apiKey: config?.apiKey,
      baseUrl: config?.baseUrl
    };
    this.currentProvider = createAiProvider(providerId, {
      ...config,
      model
    });
  }

  /**
   * Gets or locks the AI Provider instance for a specific test run.
   * Ensures mid-flight runs do not experience unexpected model changes.
   */
  public getProviderForRun(runId: string): AiProvider {
    if (this.runLocks.has(runId)) {
      return this.runLocks.get(runId)!;
    }

    // Lock current provider for this run
    this.runLocks.set(runId, this.currentProvider);
    this.runModelIds.set(runId, this.currentConfig.modelId);
    return this.currentProvider;
  }

  public getModelIdForRun(runId: string): string {
    return this.runModelIds.get(runId) || this.currentConfig.modelId;
  }

  public releaseRunLock(runId: string): void {
    this.runLocks.delete(runId);
    this.runModelIds.delete(runId);
  }

  public getActiveProvider(): AiProvider {
    return this.currentProvider;
  }

  public getActiveConfig(): ProviderConfiguration {
    return { ...this.currentConfig };
  }

  /**
   * Returns a sanitized, safe runtime status for UI displays (Dashboard, Workspace)
   */
  public getActiveAiRuntimeStatus(): ActiveAiRuntime {
    return {
      providerId: this.currentConfig.providerId,
      providerName: this.currentProvider.name,
      modelId: this.currentConfig.modelId,
      status: 'CONNECTED',
      inferenceReady: true,
      credentialSource: this.currentConfig.apiKey ? 'SECURE_STORE' : 'BUILTIN',
      providerType: this.currentConfig.providerId === 'ollama' ? 'local' : this.currentConfig.providerId === 'deterministic' ? 'deterministic' : 'cloud',
      lastVerifiedAt: new Date().toISOString()
    };
  }
}
