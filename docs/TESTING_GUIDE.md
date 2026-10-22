# Test IO Agent Studio — Testing Guide
**Test Suites:** Unit, Integration, and Autonomous E2E  
**Engine:** Node Test Runner (`node:test`) + Playwright + TypeScript (`tsx`)

---

## 1. Quick Test Commands

```bash
# Run all unit and integration test suites
pnpm test
# or: npm test

# Run the end-to-end autonomous acceptance test against Demo Testing Lab
pnpm test:e2e
# or: npm run test:e2e

# Run type checking across the whole workspace
pnpm typecheck
```

---

## 2. Test Suites Overview

### A. Unit Tests (`tests/unit/`)
1. **`permission_guard.test.ts`**:
   - Verifies **Default DENY** policy.
   - Prohibits destructive commands (`EXECUTE_SHELL`, `MODIFY_REGISTRY`, `DELETE_LOCAL_FILES`).
   - Ensures `tester.test.io` is strictly blocked from automated interactions.
   - Verifies human confirmation in `SUPERVISED_MODE`.
   - Validates authorized executions in `AUTHORIZED_AUTO_MODE` with active `AuthorizationRecord`.
2. **`evidence_and_reports.test.ts`**:
   - Computes and verifies SHA-256 hashes for all captured evidence artifacts.
   - Tests `generateReportDraft` and `validateReportDraft` against Test IO QA reporting standards.
3. **`database_storage.test.ts`**:
   - Tests SQLite migrations, foreign keys, cascades, and repositories.

### B. Integration Tests (`tests/integration/`)
1. **`browser_adapter.test.ts`**:
   - Launches genuine headless Chromium through Playwright.
   - Navigates to live `http://127.0.0.1:4173` Demo Lab.
   - Extracts page DOM, titles, interactive accessible controls.
   - Executes deterministic click actions and captures real screenshot evidence.

### C. E2E Acceptance Test (`tests/e2e/autonomous_demo.e2e.ts`)
- Implements the mandatory acceptance criteria:
  - Input: *"Kiểm tra chức năng giỏ hàng trên Demo Testing Lab. Không được thực hiện thanh toán."*
  - Automatically analyzes task and sets up boundary constraints.
  - Generates structured test plan.
  - Launches live browser execution loop.
  - Adds products to cart and inspects cart drawer total.
  - Detects the deliberate mathematical calculation bug ($29.99 displayed vs $79.98 expected).
  - Captures screenshot evidence with SHA-256 integrity hash.
  - Generates a verified Test IO-compliant Bug Report Draft.
