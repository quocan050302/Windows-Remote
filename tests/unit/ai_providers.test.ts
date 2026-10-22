import test from 'node:test';
import * as assert from 'node:assert';
import { 
  createAiProvider, 
  DeterministicQaProvider, 
  OpenAiCompatibleProvider, 
  GeminiProvider, 
  AnthropicProvider, 
  sanitizeForExternalAi 
} from '../../packages/ai-providers/src/ai_providers.js';

test('AI Providers - createAiProvider instantiates correct provider types', () => {
  const det = createAiProvider('deterministic');
  assert.ok(det instanceof DeterministicQaProvider);
  assert.strictEqual(det.name, 'Deterministic QA Engine (Built-in)');

  const ollama = createAiProvider('ollama', { baseUrl: 'http://localhost:11434/v1' });
  assert.ok(ollama instanceof OpenAiCompatibleProvider);
  assert.strictEqual(ollama.name, 'Local Ollama Engine');

  const openai = createAiProvider('openai', { apiKey: 'sk-test-mock-key' });
  assert.ok(openai instanceof OpenAiCompatibleProvider);
  assert.strictEqual(openai.name, 'OpenAI GPT Engine');

  const gemini = createAiProvider('gemini', { apiKey: 'AIzaSy-mock-gemini-key' });
  assert.ok(gemini instanceof GeminiProvider);
  assert.strictEqual(gemini.name, 'Google Gemini Generative AI');

  const claude = createAiProvider('anthropic', { apiKey: 'sk-ant-mock-key' });
  assert.ok(claude instanceof AnthropicProvider);
  assert.strictEqual(claude.name, 'Anthropic Claude Engine');
});

test('AI Providers - Rejects unsupported provider names with visible error', () => {
  assert.throws(
    () => createAiProvider('unsupported_magic_ai'),
    /Unsupported AI provider 'unsupported_magic_ai'/
  );
});

test('AI Providers - Rejects external providers when API key is missing', () => {
  assert.throws(
    () => createAiProvider('openai', { apiKey: '' }),
    /Missing API Key/
  );

  assert.throws(
    () => createAiProvider('gemini', { apiKey: '' }),
    /Missing API key/
  );

  assert.throws(
    () => createAiProvider('anthropic', { apiKey: '' }),
    /Missing API key/
  );
});

test('AI Providers - Sanitization redacts tokens, credentials and sensitive data', () => {
  const input = 'Logging in with user@example.com and password=SecretPass123! using Bearer eyJhbGciOi... and session_id=xyz987';
  const sanitized = sanitizeForExternalAi(input);

  assert.ok(!sanitized.includes('SecretPass123!'));
  assert.ok(!sanitized.includes('user@example.com'));
  assert.ok(!sanitized.includes('xyz987'));
  assert.ok(sanitized.includes('[REDACTED_PASSWORD]'));
  assert.ok(sanitized.includes('[REDACTED_EMAIL]'));
  assert.ok(sanitized.includes('[REDACTED_SESSION]'));
});

test('AI Providers - Deterministic QA Provider evaluates numeric calculations and detects bugs', async () => {
  const provider = new DeterministicQaProvider();

  // Test match
  const passResult = await provider.evaluateVerification(
    {
      pageId: 'p1',
      currentUrl: 'http://127.0.0.1:4173',
      title: 'Cart',
      controls: [],
      headings: [],
      visibleTextSnippet: 'Cart items: Product 1 ($29.99), Product 2 ($49.99). Total: $79.98',
      forms: [],
      links: [],
      consoleErrors: [],
      timestamp: new Date().toISOString()
    },
    { numericCalculation: { expected: 79.98 } }
  );
  assert.strictEqual(passResult.passed, true);
  assert.strictEqual(passResult.status, 'PASS');

  // Test discrepancy
  const failResult = await provider.evaluateVerification(
    {
      pageId: 'p1',
      currentUrl: 'http://127.0.0.1:4173',
      title: 'Cart',
      controls: [],
      headings: [],
      visibleTextSnippet: 'Cart items: Product 1 ($29.99), Product 2 ($49.99). Total: $29.99',
      forms: [],
      links: [],
      consoleErrors: [],
      timestamp: new Date().toISOString()
    },
    { numericCalculation: { expected: 79.98 } }
  );
  assert.strictEqual(failResult.passed, false);
  assert.ok(failResult.discrepancies && failResult.discrepancies.length > 0);
  assert.ok(failResult.discrepancies[0]?.includes('Cart total mismatch'));
});
