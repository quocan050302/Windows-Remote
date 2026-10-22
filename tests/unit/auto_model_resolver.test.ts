import test from 'node:test';
import * as assert from 'node:assert';
import { AutoModelResolver } from '../../packages/ai-providers/src/auto_model_resolver.js';

test('AutoModelResolver - Filters out incompatible model families', () => {
  const resolver = new AutoModelResolver();
  const mixedList = [
    'text-embedding-3-small',
    'tts-1',
    'whisper-1',
    'dall-e-3',
    'gpt-4o',
    'gpt-4o-mini',
    'text-moderation-latest'
  ];

  const compatible = resolver.filterCompatibleModels(mixedList, 'BROWSER_AGENT');
  assert.deepStrictEqual(compatible, ['gpt-4o', 'gpt-4o-mini']);
});

test('AutoModelResolver - Ranks stable and preferred models above preview or experimental variants', () => {
  const resolver = new AutoModelResolver();
  const geminiCandidates = [
    'gemini-3-flash-preview',
    'gemini-3.5-flash',
    'gemini-2.5-flash',
    'gemini-experimental'
  ];

  const ranked = resolver.rankModels('gemini', geminiCandidates, 'BROWSER_AGENT');
  // gemini-3.5-flash is top preferred and stable, so it must rank first
  assert.strictEqual(ranked[0], 'gemini-3.5-flash');
});

test('AutoModelResolver - Selects best model across providers with capability profiling', () => {
  const resolver = new AutoModelResolver();

  // Gemini selection
  const bestGemini = resolver.selectBestModel('gemini', [
    'gemini-2.5-pro',
    'gemini-3.5-flash',
    'gemini-1.5-flash-deprecated'
  ]);
  assert.strictEqual(bestGemini, 'gemini-3.5-flash');

  // OpenAI selection
  const bestOpenAi = resolver.selectBestModel('openai', [
    'gpt-3.5-turbo',
    'gpt-4o',
    'gpt-4o-mini',
    'text-embedding-ada-002'
  ]);
  assert.strictEqual(bestOpenAi, 'gpt-4o');

  // Anthropic selection
  const bestAnthropic = resolver.selectBestModel('anthropic', [
    'claude-3-opus-20240229',
    'claude-3-7-sonnet-20250219',
    'claude-3-5-haiku-20241022'
  ]);
  assert.strictEqual(bestAnthropic, 'claude-3-7-sonnet-20250219');

  // Ollama selection
  const bestOllama = resolver.selectBestModel('ollama', [
    'mistral:latest',
    'llama3.2-vision:latest',
    'nomic-embed-text:latest'
  ]);
  assert.strictEqual(bestOllama, 'llama3.2-vision:latest');

  // Deterministic engine
  const bestDet = resolver.selectBestModel('deterministic', []);
  assert.strictEqual(bestDet, 'qa-deterministic-v1');
});

test('AutoModelResolver - Handles empty candidates by falling back to known stable default', () => {
  const resolver = new AutoModelResolver();

  const fallbackGemini = resolver.selectBestModel('gemini', []);
  assert.strictEqual(fallbackGemini, 'gemini-3.5-flash');

  const fallbackOpenAi = resolver.selectBestModel('openai', []);
  assert.strictEqual(fallbackOpenAi, 'gpt-4o');

  const fallbackAnthropic = resolver.selectBestModel('anthropic', []);
  assert.strictEqual(fallbackAnthropic, 'claude-3-7-sonnet-20250219');
});
