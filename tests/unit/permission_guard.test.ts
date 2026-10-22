import test from 'node:test';
import * as assert from 'node:assert';
import { checkActionPermission, BLOCKED_DOMAINS_DEFAULT } from '../../packages/policy-engine/src/permission_guard.js';
import type { ActionContext, AuthorizationRecord } from '../../packages/shared/src/index.js';

test('Permission Guard - Default policy is strictly DENY', () => {
  const dummyContext: ActionContext = {
    sourcePlatform: 'UNKNOWN',
    destinationDomain: 'random-domain.com',
    targetDevice: 'Desktop',
    executionMode: 'COPILOT_MODE'
  };

  const decision = checkActionPermission(dummyContext, {
    type: 'CLICK',
    domain: 'random-domain.com'
  });

  assert.strictEqual(decision.status, 'DENY');
});

test('Permission Guard - Prohibits forbidden high-risk system commands', () => {
  const dummyContext: ActionContext = {
    sourcePlatform: 'TEST_IO',
    destinationDomain: 'localhost',
    targetDevice: 'Desktop',
    executionMode: 'AUTHORIZED_AUTO_MODE'
  };

  const forbiddenTypes = ['EXECUTE_SHELL', 'POWERSHELL', 'MODIFY_REGISTRY', 'DELETE_LOCAL_FILES'];
  for (const type of forbiddenTypes) {
    const decision = checkActionPermission(dummyContext, { type });
    assert.strictEqual(decision.status, 'DENY');
    assert.ok(decision.reason.includes('prohibited'));
  }
});

test('Permission Guard - Blocks tester.test.io from autonomous actions', () => {
  const dummyContext: ActionContext = {
    sourcePlatform: 'TEST_IO',
    destinationDomain: 'tester.test.io',
    targetDevice: 'Desktop',
    executionMode: 'AUTHORIZED_AUTO_MODE'
  };

  const decision = checkActionPermission(dummyContext, {
    type: 'NAVIGATE',
    domain: 'tester.test.io'
  });

  assert.strictEqual(decision.status, 'DENY');
  assert.ok(decision.reason.includes('blocked'));
});

test('Permission Guard - Requires human approval in SUPERVISED_MODE', () => {
  const context: ActionContext = {
    sourcePlatform: 'TEST_IO',
    destinationDomain: 'localhost',
    targetDevice: 'Desktop',
    executionMode: 'SUPERVISED_MODE'
  };

  // Without user approval
  const unapproved = checkActionPermission(context, {
    type: 'CLICK',
    domain: 'localhost',
    isUserApproved: false
  });
  assert.strictEqual(unapproved.status, 'REQUIRE_HUMAN_APPROVAL');

  // With user approval
  const approved = checkActionPermission(context, {
    type: 'CLICK',
    domain: 'localhost',
    isUserApproved: true
  });
  assert.strictEqual(approved.status, 'ALLOW');
});

test('Permission Guard - Allows authorized actions in AUTHORIZED_AUTO_MODE with valid AuthorizationRecord', () => {
  const auth: AuthorizationRecord = {
    id: 'auth_test_1',
    grantingOrgOrPerson: 'Lead QA',
    verificationEvidence: 'Project Test Plan Approval',
    scope: 'Demo Testing',
    allowedDomains: ['127.0.0.1', 'localhost'],
    allowedActions: ['NAVIGATE', 'CLICK', 'FILL', 'CAPTURE', 'FINISH'],
    allowedDeviceTypes: ['Desktop'],
    startTime: new Date(Date.now() - 10000).toISOString(),
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

  const decision = checkActionPermission(context, {
    type: 'CLICK',
    domain: '127.0.0.1'
  });

  assert.strictEqual(decision.status, 'ALLOW');
});
