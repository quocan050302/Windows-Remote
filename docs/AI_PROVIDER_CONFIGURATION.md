# AI Provider Configuration & Management Guide

## Supported Providers & Specifications

| Provider | Authentication | Endpoints Probed | Default Selected Model |
| :--- | :--- | :--- | :--- |
| **Google Gemini** | API Key (`x-goog-api-key`) | Discovery: `GET https://generativelanguage.googleapis.com/v1beta/models`<br>Probe: `POST .../models/{model}:generateContent` | `gemini-3.5-flash` |
| **OpenAI GPT** | API Key (`Bearer sk-...`) | Discovery: `GET https://api.openai.com/v1/models`<br>Probe: `POST https://api.openai.com/v1/chat/completions` | `gpt-4o` |
| **Anthropic Claude** | API Key (`x-api-key`, `anthropic-version: 2023-06-01`) | Discovery: `GET https://api.anthropic.com/v1/models`<br>Probe: `POST https://api.anthropic.com/v1/messages` | `claude-3-7-sonnet-20250219` |
| **Ollama Local** | None (Base URL) | Discovery: `GET {baseUrl}/api/tags`<br>Probe: `POST {baseUrl}/api/generate` | `llama3.2-vision:latest` |
| **Deterministic QA Engine** | None (Built-in offline engine) | In-memory evaluation | `qa-deterministic-v1` |

---

## Connection Verification States

All connection attempts return a typed status to prevent misleading indicators:

- `NOT_CONFIGURED`: No credential has been supplied.
- `SAVED_UNVERIFIED`: Key stored in vault, but live connectivity test has not yet run.
- `VERIFYING`: Active HTTP request and inference probe underway. Duplicate clicks disabled.
- `CONNECTED`: Authentication, dynamic discovery, and live `READY` probe succeeded. Inference ready.
- `INVALID_CREDENTIAL`: HTTP 401/403 or provider returned unauthorized token response.
- `MODEL_UNAVAILABLE`: Authentication passed, but no eligible models exist on account/server.
- `INFERENCE_FAILED`: Model was found, but generation probe failed or returned non-200.
- `RATE_LIMITED`: Provider returned HTTP 429 rate limit error.
- `QUOTA_EXCEEDED`: Provider returned account billing or credit exhaustion.
- `NETWORK_ERROR`: DNS lookup failure, connection refusal, or request timeout.
- `SERVICE_UNAVAILABLE`: Provider returned HTTP 500, 502, or 503.
- `CONFIGURATION_ERROR`: Malformed URL, illegal protocol, or unsupported provider ID.

---

## Operational Workflow

1. Open **Settings** from the desktop sidebar.
2. Under **AI Provider Connections**, select the card of your chosen provider (e.g. Google Gemini).
3. Enter your API key. (Input is masked by default with a show/hide toggle).
4. Click **Test Connection**: The app probes the provider live, retrieves accessible models, runs a minimal inference check, and displays latency and the verified model ID.
5. Click **Save Key**: Encrypts and saves the credential into the OS-backed SecretStore.
6. Click **Use This Provider**: Explicitly activates the provider for future Agent test runs.
