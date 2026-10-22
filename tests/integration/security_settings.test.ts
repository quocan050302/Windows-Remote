import test from 'node:test';
import * as assert from 'node:assert';
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AgentStudioDatabase } from '../../packages/storage/src/database.js';
import { AgentOrchestrator } from '../../packages/agent-core/src/index.js';
import { SecretStore } from '../../apps/desktop/src/main/services/secret_store.js';
import { SettingsService } from '../../apps/desktop/src/main/services/settings_service.js';
import { createLocalApiServer } from '../../apps/desktop/src/main/local_server.js';

test('Security Verification - getPublicSettings never reveals plaintext API keys', async () => {
  const testDir = path.resolve(process.cwd(), 'data', 'test_sec_1');
  fs.rmSync(testDir, { recursive: true, force: true });
  const db = new AgentStudioDatabase(path.join(testDir, 'test.db'));
  const secretStore = new SecretStore({ storageDir: path.join(testDir, 'secrets'), useFallbackEncryption: true });
  const settingsService = new SettingsService(db, secretStore);

  const realGeminiKey = 'AQ.SecretGeminiKey1234567890abcdef1234567890';
  const realOpenAiKey = 'sk-SecretOpenAiKey1234567890123456789012345';
  const realAnthropicKey = 'sk-ant-SecretAnthropicKey1234567890123456789';

  await settingsService.saveProviderKey('gemini', realGeminiKey);
  await settingsService.saveProviderKey('openai', realOpenAiKey);
  await settingsService.saveProviderKey('anthropic', realAnthropicKey);

  const publicSettings = await settingsService.getPublicSettings();
  const serialized = JSON.stringify(publicSettings);

  assert.strictEqual(serialized.includes(realGeminiKey), false, 'Gemini key must not be exposed');
  assert.strictEqual(serialized.includes(realOpenAiKey), false, 'OpenAI key must not be exposed');
  assert.strictEqual(serialized.includes(realAnthropicKey), false, 'Anthropic key must not be exposed');

  // Verify only booleans are exposed
  assert.strictEqual(publicSettings.providers.gemini.hasStoredCredential, true);
  assert.strictEqual(publicSettings.providers.openai.hasStoredCredential, true);
  assert.strictEqual(publicSettings.providers.anthropic.hasStoredCredential, true);

  db.close();
  fs.rmSync(testDir, { recursive: true, force: true });
});

test('Security Verification - Local API rejects unauthorized external origins', async () => {
  const testDir = path.resolve(process.cwd(), 'data', 'test_sec_2');
  fs.rmSync(testDir, { recursive: true, force: true });
  const db = new AgentStudioDatabase(path.join(testDir, 'test.db'));
  const secretStore = new SecretStore({ storageDir: path.join(testDir, 'secrets'), useFallbackEncryption: true });
  const settingsService = new SettingsService(db, secretStore);
  const orchestrator = new AgentOrchestrator(db);

  const serverPort = 3099;
  const server = createLocalApiServer(db, orchestrator, settingsService, serverPort);

  try {
    // Wait for server to bind
    await new Promise((r) => setTimeout(r, 100));

    // Request with malicious Origin
    const response = await fetch(`http://127.0.0.1:${serverPort}/api/settings`, {
      headers: {
        Origin: 'https://evil-attacker.example.com'
      }
    });

    assert.strictEqual(response.status, 403);
    const body = await response.json();
    assert.strictEqual(body.error, 'Forbidden origin');

    // Request with allowed local origin
    const validResponse = await fetch(`http://127.0.0.1:${serverPort}/api/settings`, {
      headers: {
        Origin: 'http://localhost:3000'
      }
    });
    assert.strictEqual(validResponse.status, 200);
  } finally {
    server.close();
    db.close();
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

test('Security Verification - External URL launcher blocks disallowed domains and unsafe schemes', async () => {
  const testDir = path.resolve(process.cwd(), 'data', 'test_sec_3');
  fs.rmSync(testDir, { recursive: true, force: true });
  const db = new AgentStudioDatabase(path.join(testDir, 'test.db'));
  const secretStore = new SecretStore({ storageDir: path.join(testDir, 'secrets'), useFallbackEncryption: true });
  const settingsService = new SettingsService(db, secretStore);
  const orchestrator = new AgentOrchestrator(db);

  const serverPort = 3098;
  const server = createLocalApiServer(db, orchestrator, settingsService, serverPort);

  try {
    await new Promise((r) => setTimeout(r, 100));

    // Block non-HTTP protocols
    const fileRes = await fetch(`http://127.0.0.1:${serverPort}/api/open-external`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'file:///C:/Windows/System32/cmd.exe' })
    });
    assert.strictEqual(fileRes.status, 400);

    const jsRes = await fetch(`http://127.0.0.1:${serverPort}/api/open-external`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'javascript:alert(1)' })
    });
    assert.strictEqual(jsRes.status, 400);

    // Allow valid external HTTPS websites for manual viewing in default browser
    const validRes = await fetch(`http://127.0.0.1:${serverPort}/api/open-external`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.nautal.com/en/' })
    });
    assert.strictEqual(validRes.status, 200);
  } finally {
    server.close();
    db.close();
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

test('Security Verification - Orchestrator unconditionally blocks tester.test.io automated browser execution', async () => {
  const testDir = path.resolve(process.cwd(), 'data', 'test_sec_4');
  fs.rmSync(testDir, { recursive: true, force: true });
  const db = new AgentStudioDatabase(path.join(testDir, 'test.db'));
  const orchestrator = new AgentOrchestrator(db);

  const result = await orchestrator.executeAgentLoop('run_sec_testio', undefined, {
    targetUrl: 'https://tester.test.io/tests/12345/tasks'
  });

  assert.strictEqual(result.finalStatus, 'BLOCKED_AUTHORIZATION');
  assert.ok(result.error);
  assert.ok(result.error.includes('SECURITY POLICY VIOLATION') || result.error.includes('prohibited by policy'));
  assert.strictEqual(result.totalStepsExecuted, 0);

  db.close();
  fs.rmSync(testDir, { recursive: true, force: true });
});
