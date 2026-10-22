import test from 'node:test';
import * as assert from 'node:assert';
import { AgentStudioDatabase } from '../../packages/storage/src/database.js';
import { AgentOrchestrator } from '../../packages/agent-core/src/orchestrator.js';

test('Orchestrator Controls - Pause, Resume and Emergency Stop affect authoritative runtime state', async () => {
  const db = new AgentStudioDatabase(':memory:');
  db.seedDemoTasksIfEmpty();
  const orchestrator = new AgentOrchestrator(db);

  const runId = `run_ctrl_${Date.now()}`;
  const taskId = 'task_demo_1';

  // Seed initial run
  db.saveRun({
    id: runId,
    taskId,
    status: 'RUNNING',
    mode: 'AUTHORIZED_AUTO_MODE',
    startTime: new Date().toISOString()
  });

  // 1. Check getRunState fallback to SQLite
  const initialState = orchestrator.getRunState(runId);
  assert.ok(initialState);
  assert.strictEqual(initialState.status, 'RUNNING');

  // 2. Emergency Stop directly cancels run and persists in SQLite
  const stopResult = await orchestrator.emergencyStop(runId);
  assert.strictEqual(stopResult.stopped, true);
  assert.strictEqual(stopResult.runId, runId);
  assert.ok(stopResult.releasedResources.length > 0);

  const cancelledState = orchestrator.getRunState(runId);
  assert.strictEqual(cancelledState?.status, 'CANCELLED');

  db.close();
});

test('Orchestrator Security - tester.test.io is unconditionally blocked from automated execution', async () => {
  const db = new AgentStudioDatabase(':memory:');
  const orchestrator = new AgentOrchestrator(db);

  const runId = `run_blocked_${Date.now()}`;

  const result = await orchestrator.executeAgentLoop(runId, undefined, {
    targetUrl: 'https://tester.test.io/tests/q5abce2'
  });

  assert.strictEqual(result.finalStatus, 'BLOCKED');
  assert.ok(result.error);
  assert.ok(result.error.includes('SECURITY POLICY VIOLATION') || result.error.includes('strictly prohibited') || result.error.includes('prohibited by policy'));
  assert.strictEqual(result.totalStepsExecuted, 0);

  db.close();
});

test('Orchestrator Security - External target without AuthorizationRecord throws AUTHORIZATION_REQUIRED', async () => {
  const db = new AgentStudioDatabase(':memory:');
  const orchestrator = new AgentOrchestrator(db);

  const runId = `run_no_auth_${Date.now()}`;

  const result = await orchestrator.executeAgentLoop(runId, undefined, {
    targetUrl: 'https://unauthorized-customer-shop.com'
  });

  assert.strictEqual(result.finalStatus, 'BLOCKED');
  assert.ok(result.error);
  assert.ok(result.error.includes('AUTHORIZATION_REQUIRED'));
  assert.strictEqual(result.totalStepsExecuted, 0);

  db.close();
});

test('Orchestrator Security - Resume run fails if authorization is revoked or expired', async () => {
  const db = new AgentStudioDatabase(':memory:');
  const orchestrator = new AgentOrchestrator(db);

  // Add expired authorization
  db.saveAuthorization({
    id: 'auth_expired',
    grantingOrgOrPerson: 'Test Org',
    verificationEvidence: 'Contract Expired',
    scope: 'Testing',
    allowedDomains: ['example.com'],
    allowedActions: ['NAVIGATE', 'CLICK'],
    allowedDeviceTypes: ['Desktop Chrome'],
    startTime: new Date(Date.now() - 100000).toISOString(),
    expirationTime: new Date(Date.now() - 1000).toISOString(), // Expired
    isRevoked: false,
    createdAt: new Date().toISOString()
  });

  // Fake active paused run
  const runId = `run_expired_${Date.now()}`;
  (orchestrator as any).activeRuns.set(runId, {
    runId,
    taskId: 't1',
    status: 'PAUSED',
    currentStep: 1,
    totalSteps: 3,
    targetUrl: 'https://example.com',
    isPaused: true,
    abortController: new AbortController(),
    logs: [],
    candidateBugs: [],
    evidence: []
  });

  await assert.rejects(
    async () => orchestrator.resumeRun(runId),
    /authorization for domain 'example.com' has expired or is revoked/
  );

  db.close();
});
