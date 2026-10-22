import test from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AgentStudioDatabase } from '../../packages/storage/src/database.js';
import { AgentOrchestrator, AiRuntimeManager } from '../../packages/agent-core/src/index.js';
import { SecretStore } from '../../apps/desktop/src/main/services/secret_store.js';
import { SettingsService } from '../../apps/desktop/src/main/services/settings_service.js';

test('Agent Provider Integration - Syncs verified provider and locks model per run', async () => {
  const testDir = path.resolve(process.cwd(), 'data', 'test_agent_int_1');
  fs.rmSync(testDir, { recursive: true, force: true });
  const dbPath = path.join(testDir, 'test.db');
  const secretsDir = path.join(testDir, 'secrets');

  const db = new AgentStudioDatabase(dbPath);
  const secretStore = new SecretStore({ storageDir: secretsDir, useFallbackEncryption: true });
  const settingsService = new SettingsService(db, secretStore);

  // 1. Initial state defaults to deterministic
  const initialSettings = await settingsService.getPublicSettings();
  assert.strictEqual(initialSettings.activeProvider, 'deterministic');

  // 2. Setup runtime manager wired to settingsService
  const runtimeManager = new AiRuntimeManager(
    () => settingsService.getActiveProviderConfiguration(),
    'deterministic'
  );
  const orchestrator = new AgentOrchestrator(db, undefined, runtimeManager);

  assert.strictEqual(orchestrator.getActiveAiProviderName(), 'Deterministic QA Engine (Built-in)');

  // 3. Save a valid key and activate Gemini
  await settingsService.saveProviderKey('gemini', 'AQ.IntegrationTestGeminiKey123456789012345');
  await settingsService.activateProvider('gemini', 'gemini-3.5-flash');

  // Sync runtime with settings
  await orchestrator.syncAiRuntimeWithSettings();

  assert.strictEqual(orchestrator.getActiveAiProviderName(), 'Google Gemini Generative AI');
  const runtimeStatus = orchestrator.getActiveAiRuntimeStatus();
  assert.strictEqual(runtimeStatus.providerId, 'gemini');
  assert.strictEqual(runtimeStatus.modelId, 'gemini-3.5-flash');

  // 4. Per-run lock isolation:
  // Run-1 locks Gemini
  const run1Provider = runtimeManager.getProviderForRun('run_alpha_1');
  const run1Model = runtimeManager.getModelIdForRun('run_alpha_1');
  assert.strictEqual(run1Provider.name, 'Google Gemini Generative AI');
  assert.strictEqual(run1Model, 'gemini-3.5-flash');

  // Now user switches active provider to Anthropic
  await settingsService.saveProviderKey('anthropic', 'sk-ant-TestAnthropicKey123456789012345');
  await settingsService.activateProvider('anthropic', 'claude-3-7-sonnet-20250219');
  await orchestrator.syncAiRuntimeWithSettings();

  // Active provider changed
  assert.strictEqual(orchestrator.getActiveAiProviderName(), 'Anthropic Claude Engine');

  // But Run-1 MUST remain locked to Gemini without disruption!
  const run1ProviderAfterSwitch = runtimeManager.getProviderForRun('run_alpha_1');
  const run1ModelAfterSwitch = runtimeManager.getModelIdForRun('run_alpha_1');
  assert.strictEqual(run1ProviderAfterSwitch.name, 'Google Gemini Generative AI');
  assert.strictEqual(run1ModelAfterSwitch, 'gemini-3.5-flash');

  // Newly started Run-2 receives the new Anthropic configuration
  const run2Provider = runtimeManager.getProviderForRun('run_beta_2');
  const run2Model = runtimeManager.getModelIdForRun('run_beta_2');
  assert.strictEqual(run2Provider.name, 'Anthropic Claude Engine');
  assert.strictEqual(run2Model, 'claude-3-7-sonnet-20250219');

  // Release lock
  runtimeManager.releaseRunLock('run_alpha_1');
  runtimeManager.releaseRunLock('run_beta_2');

  // Clean up
  db.close();
  fs.rmSync(testDir, { recursive: true, force: true });
});

test('Agent Provider Integration - Preserves credentials across service restart', async () => {
  const testDir = path.resolve(process.cwd(), 'data', 'test_agent_int_2');
  fs.rmSync(testDir, { recursive: true, force: true });
  const dbPath = path.join(testDir, 'test_restart.db');
  const secretsDir = path.join(testDir, 'secrets_restart');

  // Session 1: configure and activate OpenAI
  {
    const db1 = new AgentStudioDatabase(dbPath);
    const store1 = new SecretStore({ storageDir: secretsDir, useFallbackEncryption: true });
    const settings1 = new SettingsService(db1, store1);

    await settings1.saveProviderKey('openai', 'sk-ValidOpenAiRestartKey123456789012345');
    await settings1.activateProvider('openai', 'gpt-4o');
    db1.close();
  }

  // Session 2: application restarts, loads database and secret vault
  {
    const db2 = new AgentStudioDatabase(dbPath);
    const store2 = new SecretStore({ storageDir: secretsDir, useFallbackEncryption: true });
    const settings2 = new SettingsService(db2, store2);

    const publicSettings = await settings2.getPublicSettings();
    assert.strictEqual(publicSettings.activeProvider, 'openai');
    assert.strictEqual(publicSettings.providers.openai.hasStoredCredential, true);
    assert.strictEqual(publicSettings.providers.openai.selectedModel, 'gpt-4o');

    // Sensitive config retrieved by backend only
    const secretConfig = await settings2.getActiveProviderConfiguration();
    assert.strictEqual(secretConfig.providerId, 'openai');
    assert.strictEqual(secretConfig.modelId, 'gpt-4o');
    assert.strictEqual(secretConfig.apiKey, 'sk-ValidOpenAiRestartKey123456789012345');

    db2.close();
  }

  fs.rmSync(testDir, { recursive: true, force: true });
});
