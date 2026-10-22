import test from 'node:test';
import * as assert from 'node:assert';
import { AgentStudioDatabase } from '../../packages/storage/src/database.js';
import { AgentOrchestrator } from '../../packages/agent-core/src/orchestrator.js';
import { checkActionPermission, BLOCKED_DOMAINS_DEFAULT } from '../../packages/policy-engine/src/permission_guard.js';
import { validateExternalUrl } from '../../apps/desktop/src/main/local_server.js';
import { server as demoServer } from '../../apps/demo-testing-lab/server.js';
import type { ActionContext, AuthorizationRecord, TaskRecord } from '../../packages/shared/src/index.js';

test('1. Manual opening of arbitrary valid HTTPS URL', () => {
  // Manual opening in default browser must allow arbitrary valid HTTP and HTTPS URLs
  assert.strictEqual(validateExternalUrl('https://www.nautal.com/en/'), true);
  assert.strictEqual(validateExternalUrl('https://example.com/checkout'), true);
  assert.strictEqual(validateExternalUrl('http://127.0.0.1:4173/lab'), true);
  assert.strictEqual(validateExternalUrl('http://localhost:3000'), true);
});

test('2. Blocked invalid URL schemes for external viewing', () => {
  // Dangerous schemes must be strictly rejected
  assert.strictEqual(validateExternalUrl('javascript:alert(document.cookie)'), false);
  assert.strictEqual(validateExternalUrl('file:///C:/Windows/System32/calc.exe'), false);
  assert.strictEqual(validateExternalUrl('data:text/html,<script>alert(1)</script>'), false);
  assert.strictEqual(validateExternalUrl('vbscript:msgbox("test")'), false);
  assert.strictEqual(validateExternalUrl('powershell.exe -Command calc'), false);
  assert.strictEqual(validateExternalUrl('ftp://anonymous@ftp.example.com'), false);
  assert.strictEqual(validateExternalUrl('not-a-valid-url'), false);
});

test('3. External target without authorization is BLOCKED and default-deny is preserved', async () => {
  const db = new AgentStudioDatabase(':memory:');
  const orchestrator = new AgentOrchestrator(db);

  try {
    // Evaluating an external URL with no authorization record
    const evalResult = db.evaluateTargetAuthorization('https://www.nautal.com/en/');
    assert.strictEqual(evalResult.authorized, false);
    assert.ok(evalResult.reason.includes('nautal.com'));
    assert.ok(evalResult.reason.includes('verified authorization'));

    // Creating a task for this external target
    const task: TaskRecord = {
      id: 'task_nautal_1',
      title: 'Nautal Boat Charter Exploratory Test',
      description: 'Explore boat charter search and navigation flow',
      targetUrl: 'https://www.nautal.com/en/',
      sourcePlatform: 'TEST_IO_IMPORT',
      status: 'READY',
      executionMode: 'COPILOT_MODE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.saveTask(task);

    // Orchestrator must refuse to start without verified authorization
    const run = await orchestrator.startRun({
      taskId: task.id,
      targetUrl: 'https://www.nautal.com/en/'
    });

    assert.strictEqual(run.finalStatus, 'BLOCKED_AUTHORIZATION');
    const state = orchestrator.getRunState(run.runId);
    assert.ok(state?.logs.some((l: string) => l.includes('AUTHORIZATION_REQUIRED')));
    // Stale screenshots must not exist
    assert.strictEqual(state?.latestScreenshotBase64, undefined);
  } finally {
    db.close();
  }
});

test('4. Valid verified authorization on a test-owned site allows execution', async () => {
  const db = new AgentStudioDatabase(':memory:');
  const orchestrator = new AgentOrchestrator(db);

  try {
    // Create verified authorization
    const auth = db.createVerifiedAuthorization({
      domain: 'test-external-partner.com',
      grantingParty: 'Partner Lead QA',
      scope: 'End-to-end navigational audit',
      allowedActions: ['click', 'fill', 'navigate', 'scroll'],
      expiresAt: new Date(Date.now() + 86400000).toISOString()
    });

    assert.ok(auth.id);
    assert.strictEqual(auth.status, 'ACTIVE');
    assert.ok(auth.auditHistory && auth.auditHistory.length >= 1);

    // Verify evaluation passes
    const evalResult = db.evaluateTargetAuthorization('https://test-external-partner.com/search');
    assert.strictEqual(evalResult.authorized, true);
    assert.strictEqual(evalResult.authorization?.id, auth.id);

    // Create task and run
    const task: TaskRecord = {
      id: 'task_partner_1',
      title: 'Partner Search Audit',
      description: 'Verify navigation and search inputs on partner domain',
      targetUrl: 'https://test-external-partner.com/search',
      sourcePlatform: 'TEST_IO_IMPORT',
      status: 'READY',
      executionMode: 'COPILOT_MODE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.saveTask(task);

    const run = await orchestrator.startRun({
      taskId: task.id,
      targetUrl: 'https://test-external-partner.com/search'
    });

    // Should not be blocked by authorization
    assert.notStrictEqual(run.finalStatus, 'BLOCKED');
    const state = orchestrator.getRunState(run.runId);
    assert.strictEqual(state?.blockerReason, undefined);
    assert.ok(!state?.logs.some((l: string) => l.includes('AUTHORIZATION_REQUIRED')));
  } finally {
    db.close();
  }
});

test('5. Expired or revoked authorization blocks execution', async () => {
  const db = new AgentStudioDatabase(':memory:');
  const orchestrator = new AgentOrchestrator(db);

  try {
    // 5A. Revoked Authorization
    const auth = db.createVerifiedAuthorization({
      domain: 'revoked-test-site.com',
      grantingParty: 'Customer QA',
      scope: 'Temporary QA'
    });

    const revoked = db.revokeAuthorization(auth.id, 'Test cycle terminated early');
    assert.ok(revoked);
    assert.strictEqual(revoked.status, 'REVOKED');

    const evalRevoked = db.evaluateTargetAuthorization('https://revoked-test-site.com');
    assert.strictEqual(evalRevoked.authorized, false);
    assert.ok(evalRevoked.reason.includes('revoked'));

    // Check with Policy Engine
    const contextRevoked: ActionContext = {
      sourcePlatform: 'TEST_IO',
      destinationDomain: 'revoked-test-site.com',
      targetDevice: 'Desktop',
      authorization: evalRevoked.authorization,
      executionMode: 'AUTHORIZED_AUTO_MODE'
    };

    const permDecisionRevoked = checkActionPermission(contextRevoked, {
      type: 'CLICK',
      domain: 'revoked-test-site.com'
    });
    assert.strictEqual(permDecisionRevoked.status, 'DENY');
    assert.ok(permDecisionRevoked.violations?.includes('REVOKED_AUTHORIZATION'));

    // 5B. Expired Authorization
    const expiredAuth = db.createVerifiedAuthorization({
      domain: 'expired-test-site.com',
      grantingParty: 'Customer QA',
      scope: 'Expired QA',
      expiresAt: new Date(Date.now() - 10000).toISOString() // in the past
    });

    const evalExpired = db.evaluateTargetAuthorization('https://expired-test-site.com');
    assert.strictEqual(evalExpired.authorized, false);
    assert.ok(evalExpired.reason.includes('expired'));

    const contextExpired: ActionContext = {
      sourcePlatform: 'TEST_IO',
      destinationDomain: 'expired-test-site.com',
      targetDevice: 'Desktop',
      authorization: evalExpired.authorization,
      executionMode: 'AUTHORIZED_AUTO_MODE'
    };

    const permDecisionExpired = checkActionPermission(contextExpired, {
      type: 'CLICK',
      domain: 'expired-test-site.com'
    });
    assert.strictEqual(permDecisionExpired.status, 'DENY');
    assert.ok(permDecisionExpired.violations?.includes('EXPIRED_AUTHORIZATION'));
  } finally {
    db.close();
  }
});

test('6. Navigation or redirect outside permitted domain scope is rejected', () => {
  const auth: AuthorizationRecord = {
    id: 'auth_scoped_site',
    grantingOrgOrPerson: 'Lead QA',
    verificationEvidence: 'Project Approval',
    scope: 'Allowed partner site only',
    allowedDomains: ['permitted-shop.com'],
    allowedActions: ['NAVIGATE', 'CLICK', 'FILL'],
    allowedDeviceTypes: ['Desktop'],
    startTime: new Date(Date.now() - 1000).toISOString(),
    expirationTime: new Date(Date.now() + 100000).toISOString(),
    isRevoked: false,
    createdAt: new Date().toISOString()
  };

  const context: ActionContext = {
    sourcePlatform: 'TEST_IO',
    destinationDomain: 'permitted-shop.com',
    targetDevice: 'Desktop',
    authorization: auth,
    executionMode: 'AUTHORIZED_AUTO_MODE'
  };

  // Action on permitted domain -> ALLOW
  const allowed = checkActionPermission(context, {
    type: 'CLICK',
    domain: 'permitted-shop.com'
  });
  assert.strictEqual(allowed.status, 'ALLOW');

  // Action attempting to redirect or interact with external third-party domain -> DENY
  const redirectedAction = checkActionPermission(context, {
    type: 'NAVIGATE',
    domain: 'malicious-phishing-site.com'
  });
  assert.strictEqual(redirectedAction.status, 'DENY');
  assert.ok(redirectedAction.violations?.includes('DOMAIN_OUT_OF_SCOPE'));
});

test('7. Screenshot state and run data is cleared after a failed or blocked run', async () => {
  const db = new AgentStudioDatabase(':memory:');
  const orchestrator = new AgentOrchestrator(db);

  try {
    // Start an unauthorized run
    const run = await orchestrator.startRun({
      targetUrl: 'https://unauthorized-domain.com'
    });

    assert.strictEqual(run.finalStatus, 'BLOCKED_AUTHORIZATION');
    // Ensure no stale screenshot remains
    const state = orchestrator.getRunState(run.runId);
    assert.strictEqual(state?.latestScreenshotBase64, undefined);
    assert.strictEqual(state?.candidateBugs.length, 0);
    assert.strictEqual(state?.evidence.length, 0);
  } finally {
    db.close();
  }
});

test('8. Demo Lab continues to work with default authorization', async () => {
  if (!demoServer.listening) {
    await new Promise<void>((resolve, reject) => {
      demoServer.once('error', (err: any) => {
        if (err.code === 'EADDRINUSE') resolve();
        else reject(err);
      });
      demoServer.listen(4173, '127.0.0.1', () => resolve());
    });
  }

  const db = new AgentStudioDatabase(':memory:');
  const orchestrator = new AgentOrchestrator(db);

  try {
    // 127.0.0.1:4173 is the Demo Testing Lab
    const evalResult = db.evaluateTargetAuthorization('http://127.0.0.1:4173');
    assert.strictEqual(evalResult.authorized, true);
    assert.ok(evalResult.authorization?.allowedDomains.includes('127.0.0.1'));

    // Start Demo Lab run
    const run = await orchestrator.startRun({
      taskId: 'task_demo_1',
      targetUrl: 'http://127.0.0.1:4173'
    });

    // In accordance with Requirements Coverage rules, partial coverage with defects yields PARTIAL or COMPLETED_WITH_FINDINGS
    assert.ok(run.finalStatus === 'COMPLETED' || run.finalStatus === 'COMPLETED_WITH_FINDINGS' || run.finalStatus === 'PARTIAL');
    const state = orchestrator.getRunState(run.runId);
    assert.strictEqual(state?.currentStep, 4);
    assert.ok(state && state.candidateBugs.length > 0); // mathematical discrepancy defect identified
    assert.ok(state && state.evidence.length > 0);
  } finally {
    db.close();
  }
});

test('9. No authorization bypass via Windows-MCP or forbidden tools', () => {
  const auth: AuthorizationRecord = {
    id: 'auth_lab',
    grantingOrgOrPerson: 'Lead QA',
    verificationEvidence: 'Project Approval',
    scope: 'Demo Testing',
    allowedDomains: ['127.0.0.1', 'localhost'],
    allowedActions: ['*'],
    allowedDeviceTypes: ['Desktop'],
    startTime: new Date(Date.now() - 1000).toISOString(),
    expirationTime: new Date(Date.now() + 100000).toISOString(),
    isRevoked: false,
    createdAt: new Date().toISOString()
  };

  const context: ActionContext = {
    sourcePlatform: 'TEST_IO',
    destinationDomain: '127.0.0.1',
    targetDevice: 'Desktop',
    authorization: auth,
    executionMode: 'AUTHORIZED_AUTO_MODE'
  };

  // Even if allowedActions is '*', forbidden high-risk commands must be strictly DENIED
  const forbidden = [
    'EXECUTE_SHELL',
    'POWERSHELL',
    'MODIFY_REGISTRY',
    'DELETE_LOCAL_FILES',
    'KILL_PROCESS',
    'SUBMIT_CREDIT_CARD'
  ];

  for (const tool of forbidden) {
    const decision = checkActionPermission(context, { type: tool });
    assert.strictEqual(decision.status, 'DENY');
    assert.ok(decision.violations?.includes('HIGH_RISK_ACTION_PROHIBITED'));
  }

  // Also verify tester.test.io cannot be bypassed
  const testIoDecision = checkActionPermission(context, {
    type: 'NAVIGATE',
    domain: 'tester.test.io'
  });
  assert.strictEqual(testIoDecision.status, 'DENY');
  assert.ok(testIoDecision.violations?.includes('BLOCKED_DOMAIN_ACCESS'));
});
