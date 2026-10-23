import type {
  AiProviderId,
  ProviderPublicStatus,
  ProviderConnectionResult,
  ActiveAiRuntime,
  SettingsUpdateRequest,
  PublicSettingsResponse,
  ExecutionMode,
  BrowserLaunchMode
} from '@test-io-agent/shared';
import { AgentStudioDatabase } from '@test-io-agent/storage';
import {
  AiConnectionTestService,
  defaultConnectionTestService,
  AutoModelResolver,
  defaultAutoModelResolver
} from '@test-io-agent/ai-providers';
import { SecretStore } from './secret_store.js';

export class SettingsService {
  private secretStore: SecretStore;
  private connectionTestService: AiConnectionTestService;
  private modelResolver: AutoModelResolver;

  constructor(
    private db: AgentStudioDatabase,
    secretStore?: SecretStore,
    connectionTestService?: AiConnectionTestService,
    modelResolver?: AutoModelResolver
  ) {
    this.secretStore = secretStore || new SecretStore();
    this.connectionTestService = connectionTestService || defaultConnectionTestService;
    this.modelResolver = modelResolver || defaultAutoModelResolver;
  }

  /**
   * Returns non-sensitive public settings for the UI. Plaintext API keys are never returned.
   */
  public async getPublicSettings(): Promise<PublicSettingsResponse> {
    const activeProvider = (this.db.getSetting('active_ai_provider') as AiProviderId) || 'deterministic';
    const executionMode = (this.db.getSetting('execution_mode') as ExecutionMode) || 'COPILOT_MODE';
    const ollamaBaseUrl = this.db.getSetting('ollama_base_url') || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';

    const providers: Record<AiProviderId, ProviderPublicStatus> = {
      gemini: await this.buildProviderStatus('gemini', 'Google Gemini'),
      openai: await this.buildProviderStatus('openai', 'OpenAI GPT'),
      anthropic: await this.buildProviderStatus('anthropic', 'Anthropic Claude'),
      ollama: await this.buildProviderStatus('ollama', 'Ollama Local Models', ollamaBaseUrl),
      deterministic: {
        id: 'deterministic',
        name: 'Deterministic QA Engine (Built-in)',
        hasStoredCredential: true,
        isConfiguredViaEnv: false,
        connectionStatus: 'CONNECTED',
        selectedModel: 'qa-deterministic-v1',
        availableModels: ['qa-deterministic-v1'],
        lastTestedAt: new Date().toISOString(),
        lastLatencyMs: 1
      }
    };

    const activeMeta = providers[activeProvider] || providers.deterministic;
    const activeRuntime: ActiveAiRuntime = {
      providerId: activeMeta.id,
      providerName: activeMeta.name,
      modelId: activeMeta.selectedModel || 'qa-deterministic-v1',
      status: activeMeta.connectionStatus,
      inferenceReady: activeMeta.connectionStatus === 'CONNECTED',
      credentialSource: activeMeta.hasStoredCredential
        ? 'SECURE_STORE'
        : activeMeta.isConfiguredViaEnv
        ? 'ENVIRONMENT'
        : 'BUILTIN',
      providerType: activeMeta.id === 'ollama' ? 'local' : activeMeta.id === 'deterministic' ? 'deterministic' : 'cloud',
      lastVerifiedAt: activeMeta.lastTestedAt
    };

    const browserExecution = this.getBrowserExecutionConfig();

    return {
      activeProvider: activeMeta.id,
      activeRuntime,
      providers,
      executionMode,
      securityPolicy: {
        strictMode: true,
        blockedExternalDomains: ['tester.test.io'],
        allowAutoExternalSubmit: false
      },
      browserExecution
    };
  }

  private async buildProviderStatus(
    providerId: AiProviderId,
    name: string,
    endpointUrl?: string
  ): Promise<ProviderPublicStatus> {
    const hasStored = await this.secretStore.hasSecret(providerId);
    let isConfiguredViaEnv = false;

    if (providerId === 'gemini') isConfiguredViaEnv = Boolean(process.env.GEMINI_API_KEY);
    if (providerId === 'openai') isConfiguredViaEnv = Boolean(process.env.OPENAI_API_KEY);
    if (providerId === 'anthropic') isConfiguredViaEnv = Boolean(process.env.ANTHROPIC_API_KEY);
    if (providerId === 'ollama') isConfiguredViaEnv = Boolean(process.env.OLLAMA_BASE_URL);

    // Retrieve cached verification metadata from DB
    const rawMeta = this.db.getSetting(`provider_meta_${providerId}`);
    let meta: any = {};
    if (rawMeta) {
      try {
        meta = JSON.parse(rawMeta);
      } catch {}
    }

    let connectionStatus = meta.connectionStatus || (hasStored || isConfiguredViaEnv ? 'SAVED_UNVERIFIED' : 'NOT_CONFIGURED');
    if (!hasStored && !isConfiguredViaEnv && providerId !== 'deterministic') {
      connectionStatus = 'NOT_CONFIGURED';
    }

    return {
      id: providerId,
      name,
      hasStoredCredential: hasStored,
      isConfiguredViaEnv,
      connectionStatus,
      selectedModel: meta.selectedModel || undefined,
      availableModels: meta.availableModels || [],
      lastTestedAt: meta.lastTestedAt,
      lastLatencyMs: meta.lastLatencyMs,
      errorReason: meta.errorReason,
      endpointUrl
    };
  }

  /**
   * Securely saves an API key in the OS-encrypted SecretStore
   */
  public async saveProviderKey(providerId: AiProviderId, key: string): Promise<ProviderPublicStatus> {
    const trimmed = (key || '').trim();
    if (!trimmed) {
      throw new Error(`Cannot save empty API key for '${providerId}'.`);
    }

    await this.secretStore.saveSecret(providerId, trimmed);

    // Reset status to SAVED_UNVERIFIED upon new credential save
    const currentMetaRaw = this.db.getSetting(`provider_meta_${providerId}`);
    const meta = currentMetaRaw ? JSON.parse(currentMetaRaw) : {};
    meta.connectionStatus = 'SAVED_UNVERIFIED';
    meta.errorReason = undefined;
    this.db.setSetting(`provider_meta_${providerId}`, JSON.stringify(meta));

    const publicSettings = await this.getPublicSettings();
    return publicSettings.providers[providerId];
  }

  /**
   * Deletes a credential from the SecretStore and clears its verification state
   */
  public async removeProviderKey(providerId: AiProviderId): Promise<boolean> {
    await this.secretStore.deleteSecret(providerId);

    // Clear verification metadata in DB
    this.db.setSetting(`provider_meta_${providerId}`, JSON.stringify({
      connectionStatus: 'NOT_CONFIGURED',
      selectedModel: undefined,
      availableModels: [],
      errorReason: undefined
    }));

    // If active provider was removed, fall back safely to deterministic
    const activeProvider = this.db.getSetting('active_ai_provider');
    if (activeProvider === providerId) {
      this.db.setSetting('active_ai_provider', 'deterministic');
    }

    return true;
  }

  /**
   * Tests connection against the real provider API.
   * If draftKey is provided, it tests with the draft key without persisting it.
   * If verification succeeds on a saved or existing key, it stores the selected model and marks CONNECTED.
   */
  public async testProviderConnection(
    providerId: AiProviderId,
    draftKey?: string
  ): Promise<ProviderConnectionResult> {
    let keyToTest = draftKey?.trim();
    const isDraft = Boolean(keyToTest);

    if (!keyToTest) {
      // Load saved key from SecretStore, or fallback to environment
      const stored = await this.secretStore.getSecret(providerId);
      if (stored) {
        keyToTest = stored;
      } else if (providerId === 'gemini') {
        keyToTest = process.env.GEMINI_API_KEY;
      } else if (providerId === 'openai') {
        keyToTest = process.env.OPENAI_API_KEY;
      } else if (providerId === 'anthropic') {
        keyToTest = process.env.ANTHROPIC_API_KEY;
      }
    }

    const ollamaBaseUrl = this.db.getSetting('ollama_base_url') || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';

    const result = await this.connectionTestService.testConnection(providerId, {
      apiKey: keyToTest,
      baseUrl: ollamaBaseUrl
    });

    // If this test was for an already saved credential or verified endpoint, persist metadata
    if (!isDraft || providerId === 'ollama') {
      const meta = {
        connectionStatus: result.status,
        selectedModel: result.selectedModel,
        availableModels: result.availableModels,
        lastTestedAt: result.checkedAt,
        lastLatencyMs: result.latencyMs,
        errorReason: result.status !== 'CONNECTED' ? result.details : undefined
      };
      this.db.setSetting(`provider_meta_${providerId}`, JSON.stringify(meta));

      // Auto-activation condition (Phase B #24):
      // If the user verifies the first provider and no other cloud provider is active, activate it!
      const currentActive = this.db.getSetting('active_ai_provider') || 'deterministic';
      if (result.status === 'CONNECTED' && (currentActive === 'deterministic' || !currentActive)) {
        this.db.setSetting('active_ai_provider', providerId);
      }
    }

    return result;
  }

  /**
   * Activates a configured provider for future Agent runs
   */
  public async activateProvider(providerId: AiProviderId, verifiedModel?: string): Promise<ActiveAiRuntime> {
    if (providerId === 'deterministic') {
      this.db.setSetting('active_ai_provider', 'deterministic');
      const settings = await this.getPublicSettings();
      return settings.activeRuntime;
    }

    const hasStored = await this.secretStore.hasSecret(providerId);
    let hasEnv = false;
    if (providerId === 'gemini') hasEnv = Boolean(process.env.GEMINI_API_KEY);
    if (providerId === 'openai') hasEnv = Boolean(process.env.OPENAI_API_KEY);
    if (providerId === 'anthropic') hasEnv = Boolean(process.env.ANTHROPIC_API_KEY);
    if (providerId === 'ollama') hasEnv = true; // Ollama uses local URL

    if (!hasStored && !hasEnv) {
      throw new Error(`Cannot activate '${providerId}': No credential configured.`);
    }

    if (verifiedModel) {
      const rawMeta = this.db.getSetting(`provider_meta_${providerId}`);
      let meta: any = {};
      if (rawMeta) {
        try {
          meta = JSON.parse(rawMeta);
        } catch {}
      }
      meta.selectedModel = verifiedModel;
      this.db.setSetting(`provider_meta_${providerId}`, JSON.stringify(meta));
    }

    this.db.setSetting('active_ai_provider', providerId);
    const settings = await this.getPublicSettings();
    return settings.activeRuntime;
  }

  /**
   * Internal backend-only method to retrieve active provider configuration with plaintext credentials
   * Used exclusively by AiRuntimeManager to initialize provider clients for Agent runs.
   * NEVER serialized or returned to the frontend.
   */
  public async getActiveProviderConfiguration(): Promise<{
    providerId: AiProviderId;
    modelId: string;
    apiKey?: string;
    baseUrl?: string;
  }> {
    const activeProvider = (this.db.getSetting('active_ai_provider') as AiProviderId) || 'deterministic';

    if (activeProvider === 'deterministic') {
      return {
        providerId: 'deterministic',
        modelId: 'qa-deterministic-v1'
      };
    }

    // 1. Check SecretStore first (highest precedence)
    let apiKey = (await this.secretStore.getSecret(activeProvider)) || undefined;

    // 2. Fallback to approved environment variables
    if (!apiKey) {
      if (activeProvider === 'gemini') apiKey = process.env.GEMINI_API_KEY;
      if (activeProvider === 'openai') apiKey = process.env.OPENAI_API_KEY;
      if (activeProvider === 'anthropic') apiKey = process.env.ANTHROPIC_API_KEY;
    }

    const rawMeta = this.db.getSetting(`provider_meta_${activeProvider}`);
    let modelId = '';
    if (rawMeta) {
      try {
        const meta = JSON.parse(rawMeta);
        modelId = meta.selectedModel;
      } catch {}
    }

    if (!modelId) {
      // Resolve default if not cached
      const models = await this.modelResolver.discoverModels(activeProvider, { apiKey });
      modelId = this.modelResolver.selectBestModel(activeProvider, models, 'BROWSER_AGENT');
    }

    const baseUrl = this.db.getSetting('ollama_base_url') || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';

    return {
      providerId: activeProvider,
      modelId,
      apiKey: apiKey?.trim(),
      baseUrl
    };
  }

  /**
   * Updates general application settings (execution mode, ollama URL, browser options, etc.)
   */
  public async updateSettings(req: SettingsUpdateRequest): Promise<PublicSettingsResponse> {
    if (req.activeProvider) {
      await this.activateProvider(req.activeProvider);
    }

    if (req.defaultExecutionMode) {
      this.db.setSetting('execution_mode', req.defaultExecutionMode);
    }

    if (req.ollamaBaseUrl) {
      this.db.setSetting('ollama_base_url', req.ollamaBaseUrl.trim());
    }

    if (req.browserMode) {
      this.db.setSetting('browser_mode', req.browserMode);
    }

    if (req.openVisibleChromium !== undefined) {
      this.db.setSetting('open_visible_chromium', String(req.openVisibleChromium));
    }

    if (req.keepBrowserOpenDuringHumanReview !== undefined) {
      this.db.setSetting('keep_browser_open_during_human_review', String(req.keepBrowserOpenDuringHumanReview));
    }

    if (req.browserViewport) {
      this.db.setSetting('browser_viewport', JSON.stringify(req.browserViewport));
    }

    if (req.humanControlPolicy) {
      this.db.setSetting('human_control_policy', req.humanControlPolicy);
    }

    return this.getPublicSettings();
  }

  /**
   * Retrieves browser execution preferences
   */
  public getBrowserExecutionConfig(): {
    browserMode: BrowserLaunchMode;
    openVisibleChromium: boolean;
    keepBrowserOpenDuringHumanReview: boolean;
    browserViewport: { width: number; height: number };
    humanControlPolicy: 'strict' | 'relaxed';
  } {
    const browserMode = (this.db.getSetting('browser_mode') as BrowserLaunchMode) || 'VISIBLE_SUPERVISED';
    const openVisibleChromium = this.db.getSetting('open_visible_chromium') !== 'false';
    const keepBrowserOpenDuringHumanReview = this.db.getSetting('keep_browser_open_during_human_review') !== 'false';
    const rawViewport = this.db.getSetting('browser_viewport');
    let browserViewport = { width: 1280, height: 800 };
    if (rawViewport) {
      try {
        browserViewport = JSON.parse(rawViewport);
      } catch {}
    }
    const humanControlPolicy = (this.db.getSetting('human_control_policy') as 'strict' | 'relaxed') || 'strict';
    return {
      browserMode,
      openVisibleChromium,
      keepBrowserOpenDuringHumanReview,
      browserViewport,
      humanControlPolicy
    };
  }
}
