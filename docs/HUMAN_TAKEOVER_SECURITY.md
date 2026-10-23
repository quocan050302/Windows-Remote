# Human Takeover, Security & Compliance Policy

## 1. Compliance Statement & Ethics
Test IO Agent Studio adheres strictly to platform testing policies, website terms of service, and industry testing standards.

Autonomous testing must remain restricted to environments and targets where automation is explicitly authorized. The system **never** attempts to circumvent, spoof, or bypass security barriers.

---

## 2. Zero-Bypass Architecture (Strictly Prohibited Techniques)

The following techniques are **explicitly prohibited** and are never implemented in this repository:
1. **Automated CAPTCHA / Turnstile Solving**: No scripts or bots click or interact with challenge checkboxes, puzzle sliders, audio challenges, or verification iframes.
2. **Third-Party Solving Services**: No integration with external CAPTCHA solving APIs (e.g., 2Captcha, Anti-Captcha).
3. **Stealth Plugins & Fingerprint Spoofing**: No `puppeteer-extra-plugin-stealth`, canvas spoofing, WebGL vendor masking, or fake user agent injection designed to deceive anti-bot systems.
4. **Synthetic Human Gestures**: No randomized Bézier curve mouse paths or jitter algorithms intended to fool bot classifiers.
5. **Token Injection / Replay**: No challenge token harvesting, extraction, or replay across sessions.
6. **Profile Hijacking**: No extraction or copying of authentication cookies or sessions from the human user's personal Google Chrome / Edge profiles. The supervised browser remains an isolated, clean Chromium profile.

---

## 3. Human-in-the-Loop Verification Workflow

When an anti-bot challenge (such as Cloudflare Turnstile) appears:
1. **Agent Pauses Autonomous Execution**: The AI loop immediately halts any scheduled clicks, fills, or navigations.
2. **Control Ownership Transfers to Human**:
   - The user is notified via the Human Verification Panel.
   - The user clicks **Open / Focus Testing Browser**.
   - The human tester reviews the challenge and interacts **directly and manually** with the website's official verification UI in the real visible Chromium window.
3. **Observation-Only Readiness Check**:
   - The user returns to Agent Studio and clicks **Check Page Again**.
   - `checkPageAgain()` performs a read-only DOM inspection (`inspectWebPage()`, `detectAccessBlocker()`, `verifyApplicationReady()`).
   - It **never** issues clicks or keyboard events to the page during this check.
4. **Pre-Resume Authorization Validation**:
   - Prior to resuming autonomous testing, `validateResumeReadiness()` re-evaluates domain authorization, scope, and task execution mode (`MANUAL_ONLY` tasks are never resumed).

---

## 4. Windows-MCP & Exclusive Input Ownership

To prevent race conditions and conflicting inputs between the AI Agent and the human operator:

### Control Ownership States:
- `AI_PLAYWRIGHT`: The agent is actively executing autonomous steps. Human input through Windows-MCP tools is locked out.
- `HUMAN`: Control has been released to the human operator via `releaseControlToHuman()`. All AI Playwright actions are paused. The human has exclusive input ownership of the visible Chromium window.
- `NONE`: No active session or browser closed.

### Safe Ownership Rules:
- When the human clicks **Human Takeover**, the backend acknowledges `releaseControlToHuman()` before updating the UI state to `HUMAN_CONTROL_ACTIVE`.
- The agent never steals OS focus back from the user while `controlOwnership === 'HUMAN'`.
- Windows-MCP disconnects or errors do not affect the human's ability to directly operate the native Chromium window.

---

## 5. False Positive & Coverage Protections

1. **No Free Passes**: Encountering or clearing a security challenge **never** increments the `passedSteps` count or marks functional tests as passed.
2. **Strict Verification**: Functional steps require explicit DOM postconditions (e.g. matching selectors, visible text, URL changes) to be verified.
3. **Diagnostic Labeling**: Screenshots taken during security challenges are strictly marked as `category: 'DIAGNOSTIC'` and excluded from functional test deliverables.
