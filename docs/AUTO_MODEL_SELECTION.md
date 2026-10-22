# Automatic Model Selection Engine

## Overview
Settings V2.0 removes manual model dropdowns. Users do not need to memorize or track complex model names (e.g. `claude-3-7-sonnet-20250219`, `gemini-3.5-flash`). Instead, `AutoModelResolver` automatically queries the provider API upon credential verification, ranks the models according to capability profiles, and selects the optimal engine.

---

## Model Selection Criteria & Ranking Heuristics

1. **Accessibility Verification:**
   Only models returned by the provider's active API credentials (or verified locally in Ollama via `/api/tags`) are considered.
2. **Exclusion of Incompatible Families:**
   Models specialized in embeddings (`text-embedding-3`), audio generation (`tts-1`), speech recognition (`whisper-1`), moderation, and image synthesis (`dall-e-3`) are discarded during browser planning steps.
3. **Stability Preference:**
   Production-stable releases receive a positive score bonus over `preview`, `beta`, or `experimental` releases.
4. **Interactive Browser Responsiveness:**
   Compact, low-latency reasoning models (`flash`, `mini`, `haiku`) receive preference for iterative step execution.
5. **Vision & Multimodal Capability:**
   For `VISION_QA` or `BROWSER_AGENT` tasks requiring screenshot inspections, multimodal models receive additional scoring weighting.

---

## Preference Ordering

- **Google Gemini:**
  1. `gemini-3.5-flash`
  2. `gemini-3.8-flash`
  3. `gemini-3.7-flash`
  4. `gemini-flash-latest`
  5. `gemini-2.5-flash`
- **OpenAI:**
  1. `gpt-4o`
  2. `gpt-4o-mini`
  3. `o3-mini`
  4. `gpt-4-turbo`
- **Anthropic Claude:**
  1. `claude-3-7-sonnet-20250219`
  2. `claude-3-5-sonnet-20241022`
  3. `claude-3-5-haiku-20241022`
- **Ollama:**
  1. `llama3.2-vision:latest`
  2. `llama3.2:latest`
  3. `qwen2.5:latest`
