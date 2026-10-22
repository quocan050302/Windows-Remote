# Settings V2.0 Initial Audit & Technical Architecture Review

**Target**: Test IO Agent Studio  
**Branch**: `master`  
**Inspected Baseline**: `a2725e2b163b6cdb70595b15acff46b26e263f92`  
**Date**: October 2026  
**Auditor**: Google Antigravity (Principal Software Architect & Systems Security Engineer)

---

## 1. Executive Summary & Current Behavior

Test IO Agent Studio currently features a Settings screen (`apps/desktop/src/renderer/components/Settings.tsx`) with a visual dropdown for AI reasoning providers (Deterministic, Google Gemini, Anthropic Claude, Ollama). However, this interface is entirely static and non-functional:
1. **No State Binding**: The dropdown in `Settings.tsx` lacks `value`, `onChange`, and any dispatch mechanism to the Zustand store or backend.
2. **No Secret Configuration UI**: There are no input fields for API keys (Gemini, OpenAI, Anthropic) or base URLs (Ollama). Users are forced to manually manipulate `.env` files.
3. **Hardcoded Runtime Defaults**: `AgentOrchestrator` in `packages/agent-core/src/orchestrator.ts` defaults to `'deterministic'` unless explicitly changed in constructor calls.
4. **No Connection Testing**: The UI does not provide any "Test Connection" button. There is no feedback loop for authentication, quota limits, model reachability, or latency.
5. **Static/Stale Model Configuration**: Models in `config/model-providers.json` (such as `gemini-2.5-flash`) are hardcoded and already deprecated by upstream providers for new API keys, causing runtime 404s without automatic discovery.
6. **Local API & IPC Security Deficiencies**: `local_server.ts` starts an unauthenticated HTTP server on port 3001 and uses shell-string interpolation (`exec(start "" "${urlToOpen}")`), which introduces command-injection risks if unvalidated.

---

## 2. Root Cause Analysis: Why API Keys Are Not Applied

| Layer | Component | Root Cause |
|---|---|---|
| **Renderer (UI)** | `Settings.tsx` | `<select>` is purely presentational; no state, no API key inputs, no submit handlers, no IPC/HTTP bridge. |
| **Store** | `store.ts` | Global Zustand state has no settings slice; `modelReady: true` is hardcoded. |
| **API Client** | `api.ts` | Contains endpoints for tasks, runs, and MCP, but lacks any settings or credential management methods. |
| **IPC Bridge** | `main.ts` & `preload.ts` | No IPC channels registered for settings retrieval, credential saving, connection verification, or active provider switching. |
| **Backend API** | `local_server.ts` | No routes for settings or provider verification; runs independently without unified settings synchronization. |
| **Orchestrator** | `orchestrator.ts` | Instantiated in `main.ts` as `new AgentOrchestrator(db)`, defaulting to the deterministic provider without checking configured credentials. |

---

## 3. Security Vulnerabilities & Architectural Risks

1. **Plaintext Secrets in Process Environment / .env**:
   - Currently, API keys are loaded via `.env` into `process.env`. If child processes are spawned (e.g., Python Windows-MCP, browser adapters), secrets can leak through environment inheritance.
2. **Unauthenticated Local HTTP API**:
   - `http://127.0.0.1:3001` allows any local process or browser page (matching permissive origins) to trigger actions. Exposing credential operations over this endpoint without strong authorization/token binding is unsafe.
3. **Command Injection in `open-external`**:
   - `apps/desktop/src/main/local_server.ts` line 239 executes: `const cmd = process.platform === 'win32' ? 'start "" "' + urlToOpen + '"' : ...; exec(cmd)`. Although hostname checks exist, string interpolation into a shell command interpreter is an anti-pattern. Electron `shell.openExternal` or sanitized execution must be used exclusively.
4. **No Secret Masking / Storage Abstraction**:
   - Plaintext credentials must never be written to SQLite tables without encryption, nor exposed in API responses or logs.

---

## 4. Proposed Architectural Changes (Settings V2.0)

### 4.1 Backend Services Architecture
1. **`SecretStore` (`apps/desktop/src/main/services/secret_store.ts`)**:
   - OS-backed encrypted credential store using Electron `safeStorage` (Windows DPAPI) with fallback to AES-256-GCM hardware-derived vault for headless tests.
   - Methods: `saveSecret(providerId, secret)`, `getSecret(providerId)`, `hasSecret(providerId)`, `deleteSecret(providerId)`.
   - Never exposes stored plaintext secrets to renderer.
2. **`SettingsService` (`apps/desktop/src/main/services/settings_service.ts`)**:
   - Central authority for application settings, active provider selection, and provider verification metadata.
   - Exposes `getPublicSettings()` returning non-sensitive metadata (provider status, verified model, timestamp, latency).
   - Manages configuration precedence: Explicit User Setting > Secure SecretStore > Approved Legacy `.env` > Deterministic Fallback.
3. **`AutoModelResolver` (`packages/ai-providers/src/auto_model_resolver.ts`)**:
   - Discovers live models from real provider APIs (Google Gemini, OpenAI, Anthropic, Ollama).
   - Ranks models according to capability profiles (`BROWSER_AGENT`, `STRUCTURED_TEST_PLANNING`, `TEXT_QA`).
   - Automatically selects the optimal, verified model without forcing manual user selection.
4. **`AiConnectionTestService` (`packages/ai-providers/src/connection_test_service.ts`)**:
   - Performs real connection verification: credential authentication + model discovery + minimal test inference (`READY`).
   - Measures round-trip latency and returns sanitized error classifications (`CONNECTED`, `INVALID_CREDENTIAL`, `MODEL_UNAVAILABLE`, `RATE_LIMITED`, `QUOTA_EXCEEDED`, `NETWORK_ERROR`).
5. **`AiRuntimeManager` (`packages/agent-core/src/ai_runtime_manager.ts`)**:
   - Bridges `SettingsService` and `AgentOrchestrator`.
   - Supplies verified active provider and model to each new Agent run.
   - Ensures runs in flight maintain consistent models.

### 4.2 Frontend Redesign (`Settings.tsx`)
- Organized layout preserving dark glassmorphism theme:
  - **Active AI Provider Banner**: Status, active model, inference readiness, last verification.
  - **Provider Connection Cards**: Dedicated cards for Gemini, OpenAI, Anthropic, Ollama.
  - **Card Controls**: Masked input with Show/Hide, Save Key, Test Connection, Remove Key, Use This Provider.
  - **Diagnostics Drawer**: Collapsible panel displaying model ID, latency, check timestamp, and error category.
  - **Windows-MCP & Execution Policy**: Retained and polished.

---

## 5. Migration & Backward Compatibility Requirements
1. **Legacy `.env` Support**: If `GEMINI_API_KEY` is detected in `.env` and no encrypted secret exists, mark provider as `Configured via environment (legacy)`. Allow testing and one-click migration to encrypted storage.
2. **Zero Breaking Changes to Existing Test Suites**: All existing 25 unit/integration tests and E2E acceptance tests must continue passing.
3. **Test IO Policy Compliance**: Autonomous actions against `tester.test.io` remain strictly prohibited; verification tests run against authorized endpoints (`http://127.0.0.1:4173`).

---

## 6. Regression Risks & Mitigation Plan

| Risk | Mitigation |
|---|---|
| Electron `safeStorage` unavailable in CI/CLI tests | Implement transparent test vault fallback using PBKDF2/AES-256-GCM. |
| API rate limits or timeout on connection test | Enforce 10-second request timeouts, debounce clicks, and send minimal prompt (`READY`). |
| In-flight Agent run model switching | `AiRuntimeManager` locks provider configuration per `runId`. |
| Unsafe HTTP exposure | Credential operations are restricted to authenticated local IPC / strictly guarded session tokens. |
