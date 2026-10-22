import test from 'node:test';
import * as assert from 'node:assert';
import { AgentStudioDatabase } from '../../packages/storage/src/database.js';
import { AgentOrchestrator } from '../../packages/agent-core/src/orchestrator.js';
import { SecretStore } from '../../apps/desktop/src/main/services/secret_store.js';
import { SettingsService } from '../../apps/desktop/src/main/services/settings_service.js';
import { AiRuntimeManager } from '../../packages/agent-core/src/ai_runtime_manager.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

test('Acceptance: Gemini Runtime Provider Synchronization & No Silent Fallback', async () => {
  const testDir = path.resolve(process.cwd(), 'data', 'test_gemini_acc');
  fs.rmSync(testDir, { recursive: true, force: true });
  fs.mkdirSync(testDir, { recursive: true });

  const db = new AgentStudioDatabase(path.join(testDir, 'test.db'));
  const secretStore = new SecretStore({ storageDir: testDir });
  const settingsService = new SettingsService(db, secretStore);

  // 1. Configure Gemini provider in settings
  await secretStore.saveSecret('gemini', 'test-gemini-key-12345');
  await settingsService.activateProvider('gemini', 'gemini-2.5-flash');

  // Verify settings reflect Gemini
  const activeConfig = await settingsService.getActiveProviderConfiguration();
  assert.strictEqual(activeConfig.providerId, 'gemini');
  assert.strictEqual(activeConfig.modelId, 'gemini-2.5-flash');

  // 2. Instantiate AiRuntimeManager with authoritative provider getter
  const runtimeManager = new AiRuntimeManager(() => settingsService.getActiveProviderConfiguration());
  await runtimeManager.syncWithSettings();

  const runtimeStatus = runtimeManager.getActiveAiRuntimeStatus();
  assert.strictEqual(runtimeStatus.providerName, 'Google Gemini Generative AI');
  assert.strictEqual(runtimeStatus.modelId, 'gemini-2.5-flash');
  assert.strictEqual(runtimeStatus.inferenceReady, true);

  // 3. Orchestrator using authoritative AiRuntimeManager
  const orchestrator = new AgentOrchestrator(db, undefined, runtimeManager);
  assert.ok(orchestrator);

  // Verify getProviderForRun locks provider and returns Gemini
  const runProvider = runtimeManager.getProviderForRun('run_test_acc_1');
  assert.strictEqual(runProvider.name, 'Google Gemini Generative AI');

  // 4. Verify no silent fallback on inference failure:
  // Since test-gemini-key-12345 is not a valid live network key, calling analyzeTask or executeAgentLoop
  // MUST NOT silently revert to Deterministic QA Provider claiming it's Gemini.
  await assert.rejects(
    async () => {
      await runProvider.analyzeTask({
        title: 'Test',
        description: 'Test'
      });
    },
    (err: any) => {
      // Must surface a visible structured error
      assert.ok(err.message.includes('AI Provider API request failed') || err.message.includes('AI Inference Error'));
      // Must NOT return a dummy object from DeterministicQaProvider
      return true;
    }
  );

  db.close();
  fs.rmSync(testDir, { recursive: true, force: true });
});
