# Test IO Agent Studio — Security Policy & Controls
**Security Classification:** Core Operational Standard  
**Revision:** 1.0

---

## 1. Threat Model & Principles

Test IO Agent Studio operates with direct desktop interaction and autonomous browser execution. Because AI models are susceptible to prompt injection, hallucination, and untrusted web content, security cannot rely on model self-restraint.

### Core Security Tenets:
1. **Least Privilege**: The AI Agent only receives capabilities required for the approved testing scope.
2. **Deterministic Permission Guard**: Every action must pass an external policy check before invocation.
3. **No Arbitrary Shell / Registry Execution**:
   - The Windows-MCP tools `Shell`, `PowerShell`, `Registry`, `FileSystem`, and `Process` are **strictly blocked and omitted** from the autonomous agent's tool whitelist.
   - The agent cannot execute command lines, edit system registries, or write outside sandboxed output directories.
4. **Strict Domain Whitelisting**:
   - The browser engine rejects any navigation to domains not explicitly listed in the active `AuthorizationRecord`.
   - `tester.test.io` and any related production portal are permanently blocked from automated interactions by default.
5. **No CAPTCHA / 2FA / Anti-Bot Bypass**:
   - The application does not attempt to circumvent bot protections or defeat MFA mechanisms. If an authentication challenge appears, the agent pauses and signals `NEEDS_REVIEW`.
6. **Data Privacy & Redaction**:
   - Screenshots and network logs pass through a sensitive data filter (passwords, tokens, cookies, credit cards) before persistence or LLM transmission.
   - External LLMs receive data classified only as `PUBLIC` or anonymized `INTERNAL`. Confidential customer data is restricted to local processing unless explicitly authorized.

---

## 2. Permission Guard Architecture

The Permission Guard (`checkActionPermission`) enforces:

```typescript
export interface PermissionDecision {
  status: 'ALLOW' | 'DENY' | 'REQUIRE_HUMAN_APPROVAL';
  reason: string;
  violations?: string[];
}
```

### High-Risk Actions Requiring Explicit Rejection:
- Financial checkout / payment button triggers (unless specifically authorized synthetic payment).
- Password modification or account deletion workflows.
- Execution of external shell or batch commands.
- Sending unapproved outbound network requests or emails.
- Automatic submission of bug reports to external client bug trackers.

---

## 3. Emergency Stop Guarantee (`emergencyStop`)

When the user clicks **Emergency Stop** (or presses the emergency hotkey `Ctrl+Shift+Escape` / UI button):
1. The orchestrator's `AbortController` fires immediately.
2. Any active Playwright action is aborted.
3. Active Windows-MCP tool calls are cancelled.
4. The task status transitions to `CANCELLED`.
5. No subsequent actions can be executed until a new run is explicitly initialized.
