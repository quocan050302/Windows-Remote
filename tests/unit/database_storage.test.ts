import test from 'node:test';
import * as assert from 'node:assert';
import { AgentStudioDatabase } from '../../packages/storage/src/database.js';
import type { TaskRecord, TestPlan, AuthorizationRecord } from '../../packages/shared/src/index.js';

test('Database Storage - Stores and retrieves tasks, test plans, and authorizations', () => {
  const db = new AgentStudioDatabase(':memory:');

  const task: TaskRecord = {
    id: 'task_db_1',
    title: 'Test Checkout Flow',
    description: 'Verify shopping cart total and discounts',
    sourcePlatform: 'TEST_IO',
    targetUrl: 'http://127.0.0.1:4173',
    status: 'READY',
    executionMode: 'COPILOT_MODE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.saveTask(task);
  const fetched = db.getTask('task_db_1');
  assert.ok(fetched);
  assert.strictEqual(fetched.title, task.title);
  assert.strictEqual(fetched.status, 'READY');

  const plan: TestPlan = {
    planId: 'plan_db_1',
    taskId: 'task_db_1',
    summary: 'Plan for shopping cart',
    outOfScopeBoundaries: ['Payments'],
    createdAt: new Date().toISOString(),
    steps: [
      {
        stepId: 'step_1',
        stepNumber: 1,
        goal: 'Open Home',
        actionType: 'navigate',
        expectedBehavior: 'Page rendered',
        preconditions: [],
        allowedActions: ['navigate'],
        verificationMethod: 'DOM_ASSERTION',
        riskCategory: 'LOW',
        evidenceRequirements: ['SCREENSHOT']
      }
    ]
  };

  db.saveTestPlan(plan);
  const fetchedPlan = db.getTestPlanForTask('task_db_1');
  assert.ok(fetchedPlan);
  assert.strictEqual(fetchedPlan.steps.length, 1);
  assert.strictEqual(fetchedPlan.steps[0].goal, 'Open Home');

  const auth: AuthorizationRecord = {
    id: 'auth_db_1',
    grantingOrgOrPerson: 'Security Team',
    verificationEvidence: 'Ticket #4042',
    scope: 'Regression',
    allowedDomains: ['127.0.0.1'],
    allowedActions: ['CLICK'],
    allowedDeviceTypes: ['Desktop'],
    startTime: new Date().toISOString(),
    expirationTime: new Date(Date.now() + 10000).toISOString(),
    isRevoked: false,
    createdAt: new Date().toISOString()
  };

  db.saveAuthorization(auth);
  const fetchedAuth = db.getAuthorization('auth_db_1');
  assert.ok(fetchedAuth);
  assert.strictEqual(fetchedAuth.grantingOrgOrPerson, 'Security Team');

  db.close();
});
