import test from 'node:test';
import * as assert from 'node:assert';
import { AiConnectionTestService } from '../../packages/ai-providers/src/connection_test_service.js';
import { AutoModelResolver } from '../../packages/ai-providers/src/auto_model_resolver.js';

test('AiConnectionTestService - Deterministic provider returns immediate CONNECTED status', async () => {
  const service = new AiConnectionTestService();
  const result = await service.testConnection('deterministic');

  assert.strictEqual(result.providerId, 'deterministic');
  assert.strictEqual(result.status, 'CONNECTED');
  assert.strictEqual(result.selectedModel, 'qa-deterministic-v1');
  assert.strictEqual(result.inferenceReady, true);
  assert.ok((result.latencyMs ?? -1) >= 0);
  assert.ok(result.checkedAt);
});

test('AiConnectionTestService - Rejects empty or missing credentials with NOT_CONFIGURED', async () => {
  const service = new AiConnectionTestService();

  const geminiRes = await service.testConnection('gemini', { apiKey: '' });
  assert.strictEqual(geminiRes.status, 'NOT_CONFIGURED');
  assert.strictEqual(geminiRes.inferenceReady, false);

  const openAiRes = await service.testConnection('openai', { apiKey: '   ' });
  assert.strictEqual(openAiRes.status, 'NOT_CONFIGURED');
  assert.strictEqual(openAiRes.inferenceReady, false);

  const anthropicRes = await service.testConnection('anthropic', { apiKey: '' });
  assert.strictEqual(anthropicRes.status, 'NOT_CONFIGURED');
  assert.strictEqual(anthropicRes.inferenceReady, false);
});

test('AiConnectionTestService - Ollama rejects invalid URLs with CONFIGURATION_ERROR', async () => {
  const service = new AiConnectionTestService();

  const res = await service.testConnection('ollama', { baseUrl: 'not-a-valid-url-format' });
  assert.strictEqual(res.status, 'CONFIGURATION_ERROR');
  assert.strictEqual(res.inferenceReady, false);
});

test('AiConnectionTestService - Ollama on unreachable port returns NETWORK_ERROR', async () => {
  const service = new AiConnectionTestService();

  // Test against an inactive local port
  const res = await service.testConnection('ollama', { baseUrl: 'http://127.0.0.1:59999' });
  assert.strictEqual(res.status, 'NETWORK_ERROR');
  assert.strictEqual(res.inferenceReady, false);
  const details = res.details || '';
  assert.ok(details.toLowerCase().includes('offline') || details.toLowerCase().includes('connect'));
});

test('AiConnectionTestService - Mocked discovery and inference returns CONNECTED with latency and model', async () => {
  // Custom resolver that returns mock discovered models
  class MockResolver extends AutoModelResolver {
    override async discoverModels(): Promise<string[]> {
      return ['gemini-3.5-flash', 'gemini-3.8-flash'];
    }
  }

  const service = new AiConnectionTestService(new MockResolver());

  // Intercept global fetch for test
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('generateContent')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'READY' }] } }]
          })
        } as any;
      }
      return { ok: false, status: 404 } as any;
    };

    const res = await service.testConnection('gemini', { apiKey: 'AQ.MockValidApiKey12345678901234567890' });
    assert.strictEqual(res.status, 'CONNECTED');
    assert.strictEqual(res.selectedModel, 'gemini-3.5-flash');
    assert.strictEqual(res.inferenceReady, true);
    assert.ok((res.latencyMs ?? -1) >= 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AiConnectionTestService - 401 response from provider classifies as INVALID_CREDENTIAL', async () => {
  const service = new AiConnectionTestService();
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'API key not valid. Please pass a valid API key.' } })
    } as any);

    const res = await service.testConnection('gemini', { apiKey: 'AIzaSyInvalidKey12345678901234567890' });
    assert.strictEqual(res.status, 'INVALID_CREDENTIAL');
    assert.strictEqual(res.inferenceReady, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AiConnectionTestService - 429 response from provider classifies as RATE_LIMITED or QUOTA_EXCEEDED', async () => {
  const service = new AiConnectionTestService();
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'Resource has been exhausted (e.g. check quota).' } })
    } as any);

    const res = await service.testConnection('openai', { apiKey: 'sk-TestKeyQuotaExhausted123456789012345' });
    assert.ok(res.status === 'RATE_LIMITED' || res.status === 'QUOTA_EXCEEDED');
    assert.strictEqual(res.inferenceReady, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
