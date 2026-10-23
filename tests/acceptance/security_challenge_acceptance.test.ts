import test from 'node:test';
import * as assert from 'node:assert';
import { AgentStudioDatabase } from '../../packages/storage/src/database.js';
import { AgentOrchestrator } from '../../packages/agent-core/src/orchestrator.js';
import { server as demoServer } from '../../apps/demo-testing-lab/server.js';
import type { AuthorizationRecord } from '../../packages/shared/src/index.js';

test('Acceptance: Security Challenge Handling (Cloudflare / Turnstile Block)', async () => {
  // 1. Ensure local Demo Testing Lab server is active
  let startedServer = false;
  if (!demoServer.listening) {
    await new Promise<void>((resolve, reject) => {
      demoServer.once('error', (err: any) => {
        if (err.code === 'EADDRINUSE') resolve();
        else reject(err);
      });
      demoServer.listen(4173, '127.0.0.1', () => {
        startedServer = true;
        resolve();
      });
    });
  }

  const db = new AgentStudioDatabase(':memory:');
  const orchestrator = new AgentOrchestrator(db);

  try {
    const challengeUrl = 'http://127.0.0.1:4173/challenge';

    // 2. Setup verified authorization for local testing
    const auth: AuthorizationRecord = {
      id: `auth_challenge_${Date.now()}`,
      grantingOrgOrPerson: 'Test QA Engineer',
      verificationEvidence: 'Local fixture security verification',
      allowedDomains: ['127.0.0.1'],
      allowedActions: ['click', 'fill', 'navigate', 'scroll'],
      allowedDeviceTypes: ['Desktop Chrome'],
      scope: 'Acceptance Security Challenge Test',
      startTime: new Date().toISOString(),
      expirationTime: new Date(Date.now() + 86400000).toISOString(),
      isRevoked: false,
      status: 'ACTIVE',
      createdAt: new Date().toISOString()
    };
    db.saveAuthorization(auth);

    // 3. Create a task pointing to the simulated challenge page
    const challengeTask = {
      id: 'task_cf_challenge',
      title: 'Cloudflare Verification Blocker Acceptance',
      description: 'Attempting to test simulated challenge page',
      targetUrl: challengeUrl,
      sourcePlatform: 'TEST_IO_IMPORT',
      status: 'READY' as const,
      executionMode: 'AUTHORIZED_AUTO_MODE' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.saveTask(challengeTask);

    // 4. Start the autonomous run
    const runResult = await orchestrator.executeAgentLoop(`run_cf_${Date.now()}`, undefined, {
      targetUrl: challengeUrl,
      taskId: challengeTask.id,
      authorizationId: auth.id,
      allowHumanVerification: false,
      maxSteps: 5
    });

    // 5. Assertions matching Requirement 25:
    // Security challenge detected
    assert.strictEqual(runResult.finalStatus, 'BLOCKED_SITE_VERIFICATION');

    // No product testing actions performed
    assert.strictEqual(runResult.totalStepsExecuted, 0);

    // Zero functional cases marked PASS
    assert.strictEqual(runResult.passedSteps, 0);

    // No fake bug report
    assert.strictEqual(runResult.bugsFound, 0);
    const bugs = db.listCandidateBugs(runResult.runId);
    assert.strictEqual(bugs.length, 0, 'Must not declare Cloudflare or CAPTCHA screen as a product defect');

    // Diagnostic screenshot captured where permitted
    const evidence = db.listEvidence(runResult.runId);
    assert.ok(evidence.length > 0, 'Diagnostic evidence should be captured');
    const diagEvidence = evidence.find(e => e.category === 'DIAGNOSTIC');
    assert.ok(diagEvidence, 'Evidence should be categorized as DIAGNOSTIC');

    // Run state verification
    const finalRunState = orchestrator.getRunState(runResult.runId);
    assert.strictEqual(finalRunState?.status, 'BLOCKED_SITE_VERIFICATION');
    assert.ok(finalRunState?.blockerReason?.includes('Cloudflare Turnstile'));

    // Stale reasoning must not be present
    assert.strictEqual(finalRunState?.activeStepGoal, undefined);

  } finally {
    db.close();
    if (demoServer.listening) {
      demoServer.close();
    }
  }
});
