# Human Verification Mode & Supervised Playwright Architecture

## 1. Overview & Objective
Test IO Agent Studio provides autonomous and supervised functional testing for web applications. When navigating websites protected by bot-detection services (such as Cloudflare Turnstile, hCaptcha, or reCAPTCHA), automated agents encounter security challenges asking to "Verify you are human".

Previously, Test IO Agent Studio operated in a headless mode that immediately marked runs as blocked, failed, or prematurely completed, terminating the Playwright browser in its `finally` block and leaving the human tester looking at a non-interactive screenshot.

**Human Verification Mode** fixes this by:
1. Launching a **real visible Chromium window** (`headless: false`, `launchMode: 'VISIBLE_SUPERVISED'`) from the very beginning of any supervised run.
2. Detecting the challenge via `detectAccessBlocker()` and transitioning to `AWAITING_HUMAN_VERIFICATION`.
3. Pausing the Playwright action scheduling loop and holding the execution promise without terminating the browser session.
4. Enabling **Human Takeover** (`releaseControlToHuman()`) so that the human tester can directly interact with the real visible browser window.
5. Providing **Check Page Again** (`checkPageAgain()`) to inspect the DOM using `verifyApplicationReady()` and check if real application controls are accessible.
6. Enabling **Safe Resume** (`resumeAfterHumanVerification()`) that resumes execution on the **exact same Browser, Context, and Page** instance without refreshing or reopening tabs.

---

## 2. Core Operational Workflow

```
[Start Supervised AI Test]
           │
           ▼
[Launch Real Visible Chromium] ────────► Stable IDs: sessionId, browserId, contextId, pageId
           │
           ▼
[Navigate to Target URL]
           │
           ▼
[detectAccessBlocker()]
    ├── Clear ─────────────────────────► Continue Functional Test Steps
    └── Challenge Detected
           │
           ▼
[handleSecurityChallenge()]
    ├── Capture DIAGNOSTIC Screenshot
    ├── Focus Browser Window (`focusTestingBrowser`)
    ├── State -> AWAITING_HUMAN_VERIFICATION
    └── Enter `awaitHumanDecision(runId)` (Promise holding loop)
           │
           ├──────────────────────────┐
           │ [Human Takeover]         │ [Emergency Stop]
           ▼                          ▼
    [releaseControlToHuman()]     [Abort & Clean Exit]
    Ownership -> HUMAN
           │
           ▼
    [Tester Manually Clears Challenge in Chromium]
           │
           ▼
    [Tester Clicks "Check Page Again"]
           │
           ▼
    [checkPageAgain(runId)]
    ├── inspectWebPage(pageId)
    ├── detectAccessBlocker() -> cleared?
    └── verifyApplicationReady() -> isReady?
           │
     ┌─────┴───────────────┐
     ▼ Still Blocked       ▼ Page Ready
  [Remain Paused]      [validateResumeReadiness()]
                       ├── Check Authorization
                       ├── Check ExecutionMode !== MANUAL_ONLY
                       └── Enable "Resume AI Testing"
                                   │
                                   ▼ [Resume Clicked]
                       [resumeAfterHumanVerification()]
                       Ownership -> AI_PLAYWRIGHT
                       Re-inspect current DOM
                       Execute functional test assertions
```

---

## 3. Launch Modes & Permissions

Three explicit browser launch modes are defined in `packages/shared/src/index.ts`:

| Launch Mode | Headless? | Human Supervision Permitted? | Autonomous Resume Allowed? |
|---|---|---|---|
| `HEADLESS_AUTOMATION` | Yes (`headless: true`) | No — terminal blocker exit | N/A |
| `VISIBLE_SUPERVISED` | No (`headless: false`) | Yes — transitions to `AWAITING_HUMAN_VERIFICATION` | Yes, if authorization valid |
| `MANUAL_ONLY` | No (`headless: false`) | Yes — tester performs all verification & tests | No — autonomous resume prohibited |

---

## 4. Key Orchestrator Methods

- `createVisibleBrowserSession(options, authorization)`: Starts a headful Chromium instance with stable session IDs and sets up browser disconnect listeners.
- `handleSecurityChallenge(runId, sessionId, blocker)`: Stops action scheduling, records blocker details, captures diagnostic evidence, sets `isPaused = true`, and notifies frontend.
- `awaitHumanDecision(runId, abortSignal)`: A non-busy wait promise that resolves upon human decision (`RESUME`, `CANCEL`, or `BROWSER_CLOSED`).
- `focusTestingBrowser(sessionId)`: Brings the active browser window/page to the foreground.
- `releaseControlToHuman(runId)`: Sets control ownership to `HUMAN`, pausing AI scheduling.
- `checkPageAgain(runId)`: Diagnostic observation only. Does not click or interact with challenge widgets.
- `validateResumeReadiness(runId)`: Checks that the session is alive, blocker is gone, application is ready, authorization remains valid, and execution mode permits automation.
- `resumeAfterHumanVerification(runId)`: Reclaims control (`AI_PLAYWRIGHT`), refreshes page observations, and resumes functional test steps.

---

## 5. UI Integration (Workspace & Settings)

1. **Workspace Browser View**:
   - Displays real-time status banners: `Visible Browser`, `Headless Session`, or `Manual Control`.
   - Displays control ownership badge: `AI Playwright Control` vs `Human Control Active`.
   - Security verification panel appears when Cloudflare is detected, providing:
     - Clear step-by-step instructions.
     - **Open / Focus Testing Browser** button.
     - **Check Page Again** button with loading feedback.
     - **Resume AI Testing** button (enabled only when `canResume === true`).
     - **Cancel Run / Emergency Stop** button.
2. **Settings > Browser Execution & Supervised Human Controls**:
   - Configure Browser Execution Mode (`VISIBLE_SUPERVISED`, `HEADLESS_AUTOMATION`, `MANUAL_ONLY`).
   - Toggle "Open Visible Chromium".
   - Toggle "Keep Browser Open During Human Review".
   - Configure Viewport presets (1280x800, 1920x1080, etc.).
   - Configure Human Control Policy (`PAUSE_AND_NOTIFY`, `MANUAL_TAKEOVER_ONLY`, `TERMINATE_ON_BLOCKER`).
