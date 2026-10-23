# Playwright Session Lifecycle & Session Preservation

## 1. Overview
In automated end-to-end testing, browser sessions are traditionally treated as short-lived, throwaway resources. If an unhandled exception or security challenge occurs, conventional frameworks terminate the browser in a `finally` block.

In **Test IO Agent Studio**, human-in-the-loop verification requires a fundamentally different paradigm:
When a human verification challenge is encountered, the browser session, context, and page must **remain completely alive and accessible** for manual interaction by the human tester.

---

## 2. Session Entity Hierarchy & Stable Identifiers

Each test run maintains a strict hierarchy of unique, persistent identifiers:

```
Run (runId)
  └── BrowserSession (sessionId)
        ├── Playwright Browser instance (browserId)
        └── Playwright BrowserContext (contextId)
              └── Playwright Page (pageId)
```

- `sessionId`: `session_<timestamp>_<random>` — Stable identifier tracked in `BrowserSessionManager` and `activeRuns`.
- `browserId`: Identifier corresponding to the Chromium instance process.
- `contextId`: Browser isolation context maintaining cookies, storage, and clearance tokens.
- `pageId`: `page_<timestamp>_<random>` — The exact tab where the website and challenge are loaded.

**Critical Guarantee**:
When the human clicks "Human Takeover", completes the challenge in Chromium, clicks "Check Page Again", and clicks "Resume AI Testing", **no new browser, context, or page is created**. Resuming re-uses the exact same `Page` instance, preserving the `cf_clearance` cookies and session state established during the human interaction.

---

## 3. Lifecycle States & Transitions

```
[ALLOCATED] ──► [RUNNING] ──► [CHALLENGE DETECTED]
                                    │
                                    ▼
                             [AWAITING_HUMAN_VERIFICATION]
                             (Session Kept Alive)
                                    │
                       ┌────────────┴────────────┐
                       ▼                         ▼
             [HUMAN_CONTROL_ACTIVE]       [EMERGENCY_STOP / CANCEL]
             (Session Kept Alive)                │
                       │                         ▼
                       ▼                   [TERMINATING]
             [VERIFYING_PAGE_ACCESS]             │
             (Session Kept Alive)                ▼
                       │                    [CLOSED]
                       ▼
             [READY_TO_RESUME]
             (Session Kept Alive)
                       │
                       ▼
                 [RESUMED] ──► [COMPLETED / FAILED]
                                    │
                                    ▼
                              [TERMINATING] ──► [CLOSED]
```

### Non-Terminal vs Terminal States:
- **Non-Terminal States (Session Preserved)**:
  - `AWAITING_HUMAN_VERIFICATION`
  - `HUMAN_CONTROL_ACTIVE`
  - `VERIFYING_PAGE_ACCESS`
  - `READY_TO_RESUME`
  - `PAUSED`
- **Terminal States (Session Cleaned Up)**:
  - `COMPLETED`
  - `FAILED`
  - `EMERGENCY_STOPPED`
  - `STOPPED`
  - `SECURITY_CHALLENGE_BLOCKED` (for unsupervised / headless sessions only)

---

## 4. Lifecycle Ownership & Refactored Finally Guard

Previously, `executeAgentLoop` contained:
```typescript
finally {
  if (activeBrowserSession) {
    await this.browserManager.closeSession(activeBrowserSession.sessionId);
  }
}
```
This closed the browser whenever the loop exited or paused.

The refactored implementation uses an **abortable wait promise** (`awaitHumanDecision()`) while execution is paused. If the loop ever finishes or an error escapes:
```typescript
finally {
  const currentStatus = runState?.status;
  const isWaitingForHuman =
    currentStatus === 'AWAITING_HUMAN_VERIFICATION' ||
    currentStatus === 'HUMAN_CONTROL_ACTIVE' ||
    currentStatus === 'VERIFYING_PAGE_ACCESS' ||
    currentStatus === 'READY_TO_RESUME' ||
    currentStatus === 'PAUSED';

  if (activeBrowserSession && !isWaitingForHuman) {
    await this.browserManager.closeSession(activeBrowserSession.sessionId).catch(() => {});
  }
}
```

---

## 5. Browser Disconnect & Page Close Handling

`BrowserSessionManager` registers proactive event listeners on every browser and page:
1. `browser.on('disconnected')`:
   - Detects when the human or OS closes the Chromium browser window.
   - Marks the session as dead (`sessionAlive = false`).
   - Resolves `humanDecisionResolve('BROWSER_CLOSED')`.
   - Transitions run to `STOPPED` with the truthful log: `"Browser session closed by user"`.
   - Prevents silent re-launches or loop hangs.
2. `page.on('close')`:
   - Cleans up internal page map entries.
