# Test IO Agent Studio — Known Limitations & Future Roadmap
**Version:** 1.0  
**Last Updated:** 22/10/2026

---

## 1. Intentional Security & Policy Limitations

1. **No External Platform Automation**:
   - Automated browsing and submission on `tester.test.io` or customer production portals is deliberately restricted.
   - All bug reports are produced as `DRAFT` for human tester verification and manual submission in accordance with Test IO rules.
2. **Prohibited Desktop System Tools**:
   - The Windows-MCP tools `Shell`, `PowerShell`, `Registry`, `FileSystem`, and `Process` are permanently disabled to prevent system modification or destructive prompt injections.
3. **Financial Transaction Boundary**:
   - Autonomous payment completion or credit card submission is permanently blocked.

---

## 2. Platform & Device Scope Limitations

1. **Desktop Windows Focus in V1**:
   - Windows-MCP operates natively on Windows 10/11. On macOS or Linux, the system operates using the Playwright browser engine and simulated desktop adapter.
2. **Mobile Testing**:
   - Windows-MCP cannot replace physical mobile devices (real iOS/Android phones). Test IO cycles requiring physical devices must be tested manually or with dedicated mobile test farms.
3. **CAPTCHA & 2FA**:
   - The agent does not attempt to bypass bot protections. When an anti-bot challenge is detected, the run enters `PAUSED` / `NEEDS_REVIEW` state for human takeover.

---

## 3. V2 / V3 Roadmap Priorities

1. **V2: Multi-Tab & Complex OAuth Orchestration**:
   - Support for advanced third-party login flows (Google/GitHub SSO) within authorized testing sandboxes.
2. **V2: Vision LLM Annotation Overlay**:
   - Integrated bounding box visual reasoning over downscaled Playwright full-page screenshots.
3. **V3: macOS Native Accessibility Adapter**:
   - Native macOS Accessibility API adapter to complement Windows-MCP on Apple Silicon workstations.
