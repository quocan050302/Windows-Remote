# AUDIT REPORT — HUMAN VERIFICATION & PLAYWRIGHT TAKEOVER (V3)
**Repository**: `Windows-Remote` / Test IO Agent Studio  
**Date**: 2026-10-23  
**Status**: Initial Audit Completed  
**Baseline HEAD**: `5df1f1f9cb350577c71bacdadb81f606eae82e9a`

---

## 1. Executive Summary
The existing Test IO Agent Studio successfully detects Cloudflare Turnstile, CAPTCHA, and security challenges using multi-signal heuristics (`detectAccessBlocker`), and properly marks steps as unverified rather than falsely declaring `PASS`.
However, when a genuine security verification page appears (such as when testing `https://www.nautal.com/en/`):
1. Chromium is launched in **headless** mode (`headless: true`), making the real browser window completely invisible to the human operator.
2. The user only sees a static/streamed screenshot of the challenge inside the Workspace viewer, but cannot interact with or solve the verification widget in that screenshot.
3. Upon detecting `detectAccessBlocker`, `executeAgentLoop` immediately terminates with a terminal return and the `finally` block executes `browserManager.closeSession()`, killing the Playwright browser process.
4. The "Human Takeover" button in `TestWorkspace.tsx` only triggers `takeoverMcp()` in the Windows-MCP adapter, toggling a boolean flag. It never pauses the actual Playwright orchestrator loop nor does it retain the browser session.

This audit documents the root causes, affected modules, architectural defects, and the concrete design to implement a genuine, secure Human Verification Mode.

---

## 2. Source Code Audit & Root Causes

### 2.1 Headless Browser Launch
- **File**: `packages/agent-core/src/orchestrator.ts`
- **Method**: `executeAgentLoop()` (lines 484–487)
- **Current Behavior**:
  ```typescript
  activeBrowserSession = await this.browserManager.createBrowserSession(
    { headless: true },
    auth
  );
  ```
- **Defect**: The browser is always launched headless. A headless Chromium session cannot dynamically become visible in Windows without restarting the process (which loses the session state and Cloudflare challenge token).
- **Required Fix**: Introduce browser execution modes (`HEADLESS_AUTOMATION`, `VISIBLE_SUPERVISED`, `MANUAL_ONLY`). For human-interactive or supervised runs on authorized external domains, launch a real headful/visible Chromium instance from the start.

### 2.2 Premature Browser Session Destruction in `finally`
- **File**: `packages/agent-core/src/orchestrator.ts`
- **Method**: `executeAgentLoop()` (lines 933–939)
- **Current Behavior**:
  ```typescript
  } finally {
    this.runtimeManager.releaseRunLock(runId);
    if (activeBrowserSession) {
      await this.browserManager.closeSession(activeBrowserSession.sessionId).catch(() => {});
    }
    this.activeAbortControllers.delete(runId);
  }
  ```
- **Defect**: When `detectAccessBlocker` detects a challenge, `executeAgentLoop` returns early. The `finally` block unconditionally destroys the browser session.
- **Required Fix**: When a challenge is detected in a supervised session, transition to `AWAITING_HUMAN_VERIFICATION`. Do NOT exit `executeAgentLoop` prematurely; instead, use an abortable, externally resolvable wait mechanism (`awaitHumanDecision`) that keeps the browser session alive while waiting for human action.

### 2.3 Disconnected Human Takeover
- **File**: `apps/desktop/src/renderer/store.ts` (lines 348–352) & `apps/desktop/src/renderer/components/TestWorkspace.tsx`
- **Current Behavior**:
  ```typescript
  triggerTakeover: async () => {
    const nextState = !get().isUserTakeover;
    set({ isUserTakeover: nextState, isPaused: nextState, agentStatus: nextState ? 'PAUSED' : 'RUNNING' });
    await apiClient.takeoverMcp(nextState);
  }
  ```
- **Defect**: Clicking "Human Takeover" updates local Zustand store state and calls `apiClient.takeoverMcp(nextState)` which only informs Windows-MCP. It does NOT call `pauseRun(runId)` in `AgentOrchestrator`, so Playwright actions are not genuinely paused by takeover.
- **Required Fix**: Implement an authoritative control ownership state (`AI_PLAYWRIGHT`, `HUMAN`, `NONE`). When Human Takeover is triggered, the backend must pause Playwright execution, bring the visible Chromium window into focus (`focusTestingBrowser`), and confirm `HUMAN_CONTROL_ACTIVE` before allowing manual interaction.

### 2.4 Lack of Re-checking Page Readiness After Manual Verification
- **File**: `packages/agent-core/src/orchestrator.ts` & `apps/desktop/src/main/local_server.ts`
- **Current Behavior**: No backend endpoint exists to re-inspect the active page after the human completes the verification in the visible browser.
- **Defect**: The user has no way to tell the Agent: "I solved the verification, please inspect the page and confirm readiness to resume."
- **Required Fix**: Implement `checkPageAgain(runId)` and `validateResumeReadiness(runId)`. It re-evaluates `detectAccessBlocker()` and `verifyApplicationReady()`, verifies authorization validity, and if clear, allows `resumeAfterHumanVerification(runId)` on the SAME Page/Context/Browser instance.

### 2.5 Strict Compliance: Anti-Bypass Policy
- **Constraint**: Absolute prohibition against automated CAPTCHA solving, automatic checkbox clicking, stealth evasion plugins, canvas/audio fingerprint spoofing, or token injection.
- **Design Principle**: The human operator must manually solve any security challenges directly in the official visible Chromium browser window. The Agent only acts as an observer, readiness validator, and resumed functional tester.

---

## 3. Proposed Architecture

```
[User Starts Run]
        │
        ▼
[Check Execution Mode] ──► VISIBLE_SUPERVISED: Launch Visible Chromium
        │
        ▼
[Navigate to Target]
        │
        ▼
[detectAccessBlocker(observation)]
        │
 ┌──────┴───────────────────────────────────────────────────────┐
 │                                                              │
 ▼ (No Blocker)                                                 ▼ (Blocker Detected)
[verifyApplicationReady()]                          [handleSecurityChallenge()]
 │                                                              │
 ├─► Ready: Execute Functional Test Scenarios                   ├─► Mode Not Supervised: Terminate BLOCKED_SITE_VERIFICATION
 └─► Not Ready: Report Needs Review                             └─► Supervised Mode:
                                                                      │
                                                                      ▼
                                                        [AWAITING_HUMAN_VERIFICATION]
                                                        • Browser remains ALIVE & VISIBLE
                                                        • Diagnostic screenshot captured
                                                        • Banner shown in UI: "Security Verification Required"
                                                        • Playwright execution loop paused
                                                                      │
                                                    ┌─────────────────┴─────────────────┐
                                                    ▼                                   ▼
                                            [Focus Browser]                   [Emergency Stop / Cancel]
                                            (User solves challenge                     │
                                             manually in browser)                      ▼
                                                    │                             Terminates session
                                                    ▼
                                            [Click: "Check Page Again"]
                                                    │
                                                    ▼
                                            [checkPageAgain(runId)]
                                            • Re-evaluates blocker & readiness
                                            • If still challenge -> Stay paused
                                            • If application ready -> READY_TO_RESUME
                                                    │
                                                    ▼
                                            [validateResumeReadiness(runId)]
                                            • Checks authorization still valid
                                            • Confirms task has automation scope
                                                    │
                                                    ▼
                                            [resumeAfterHumanVerification(runId)]
                                            • Continues on SAME Browser/Context/Page
                                            • Refreshes DOM observations & locators
                                            • Executes remaining functional steps
                                            • Calculates accurate coverage matrix
```

---

## 4. Test Strategy
1. **Local Challenge Fixture**: Extend `apps/demo-testing-lab` with `/challenge` supporting a manual resolution interaction (e.g. checkbox/button that transitions state to accessible application).
2. **Unit Tests**:
   - Verification states (`AWAITING_HUMAN_VERIFICATION`, `HUMAN_CONTROL_ACTIVE`, `READY_TO_RESUME`).
   - Browser visibility configuration and validation.
   - Control ownership transitions (`AI_PLAYWRIGHT` <-> `HUMAN`).
3. **Integration Tests**:
   - Backend APIs for `check-page-again`, `focus-browser`, `resume-readiness`, and `resume-verification`.
   - Browser preservation: ensuring `activeBrowserSession` is not closed while paused.
4. **Acceptance Tests**:
   - End-to-end flow on local fixture: Detect challenge -> Pause -> Human takeover -> Manual solve -> Check page again -> Resume same session -> Complete functional testing -> Accurate coverage.
