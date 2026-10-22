import test from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SecretStore } from '../../apps/desktop/src/main/services/secret_store.js';

test('SecretStore - Saves, retrieves, and checks secret presence securely', async () => {
  const testDir = path.resolve(process.cwd(), 'data', 'test_secrets_1');
  const store = new SecretStore({ storageDir: testDir, useFallbackEncryption: true });

  const saved = await store.saveSecret('gemini', 'AQ.TestKey1234567890abcdef');
  assert.strictEqual(saved, true);

  const exists = await store.hasSecret('gemini');
  assert.strictEqual(exists, true);

  const retrieved = await store.getSecret('gemini');
  assert.strictEqual(retrieved, 'AQ.TestKey1234567890abcdef');

  // Verify file on disk does NOT contain the plaintext secret
  const vaultPath = path.join(testDir, 'ai_credentials.vault');
  assert.ok(fs.existsSync(vaultPath));
  const rawDiskContent = fs.readFileSync(vaultPath, 'utf8');
  assert.strictEqual(rawDiskContent.includes('AQ.TestKey1234567890abcdef'), false, 'Plaintext secret must never appear on disk');

  // Clean up
  fs.rmSync(testDir, { recursive: true, force: true });
});

test('SecretStore - Atomic key replacement preserves old key if replacement fails', async () => {
  const testDir = path.resolve(process.cwd(), 'data', 'test_secrets_2');
  const store = new SecretStore({ storageDir: testDir, useFallbackEncryption: true });

  await store.saveSecret('openai', 'sk-OriginalKey12345');
  assert.strictEqual(await store.getSecret('openai'), 'sk-OriginalKey12345');

  // Attempt replacement with invalid empty key
  await assert.rejects(
    async () => store.rotateSecret('openai', '   '),
    /cannot be empty/
  );

  // Original key remains intact
  assert.strictEqual(await store.getSecret('openai'), 'sk-OriginalKey12345');

  // Valid replacement
  await store.rotateSecret('openai', 'sk-NewKey99999');
  assert.strictEqual(await store.getSecret('openai'), 'sk-NewKey99999');

  fs.rmSync(testDir, { recursive: true, force: true });
});

test('SecretStore - Deletes secret and handles non-existent or corrupted vault gracefully', async () => {
  const testDir = path.resolve(process.cwd(), 'data', 'test_secrets_3');
  const store = new SecretStore({ storageDir: testDir, useFallbackEncryption: true });

  await store.saveSecret('anthropic', 'sk-ant-SecretKey123');
  assert.strictEqual(await store.hasSecret('anthropic'), true);

  const deleted = await store.deleteSecret('anthropic');
  assert.strictEqual(deleted, true);
  assert.strictEqual(await store.hasSecret('anthropic'), false);
  assert.strictEqual(await store.getSecret('anthropic'), null);

  // Deleting again returns false
  assert.strictEqual(await store.deleteSecret('anthropic'), false);

  // Corrupted vault file simulation
  const vaultPath = path.join(testDir, 'ai_credentials.vault');
  fs.writeFileSync(vaultPath, '{ invalid JSON corrupted content %%%', 'utf8');

  // Should not crash, returns null
  const corruptRes = await store.getSecret('gemini');
  assert.strictEqual(corruptRes, null);

  fs.rmSync(testDir, { recursive: true, force: true });
});

test('SecretStore - Secret redaction utility masks credentials across logs', () => {
  const rawLog = 'Connecting with Gemini AQ.TestSyntheticSampleKeyForRedactionTesting0000 and OpenAI sk-abc123456789012345678901234567890 and Anthropic sk-ant-secretkey12345678901234567890';
  const redacted = SecretStore.redactSecret(rawLog);

  assert.ok(!redacted.includes('AQ.TestSyntheticSampleKeyForRedactionTesting0000'));
  assert.ok(!redacted.includes('sk-abc123456789012345678901234567890'));
  assert.ok(!redacted.includes('sk-ant-secretkey12345678901234567890'));
  assert.ok(redacted.includes('[REDACTED_GEMINI_KEY]'));
  assert.ok(redacted.includes('[REDACTED_API_KEY]'));
  assert.ok(redacted.includes('[REDACTED_ANTHROPIC_KEY]'));
});
