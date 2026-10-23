import test from 'node:test';
import * as assert from 'node:assert';
import { AgentStudioDatabase } from '../../packages/storage/src/database.js';
import { AgentOrchestrator } from '../../packages/agent-core/src/orchestrator.js';
import { server as demoServer } from '../../apps/demo-testing-lab/server.js';
import type { AuthorizationRecord } from '../../packages/shared/src/index.js';

test('Acceptance: Real Human Verification & Playwright Session Takeover Flow', async (t) => {
  // Ensure local Demo Testing Lab server is running
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

  // Setup verified authorization for 127.0.0.1
  const auth: AuthorizationRecord = {
    id: `auth_human_test_${Date.now()}`,
    grantingOrgOrPerson: 'Lead QA Engineer',
    verificationEvidence: 'Acceptance Verification Approval',
    allowedDomains: ['127.0.0.1'],
    allowedActions: ['click', 'fill', 'navigate', 'scroll'],
    allowedDeviceTypes: ['Desktop Chrome'],
    scope: 'Supervised Human Verification Acceptance',
    startTime: new Date().toISOString(),
    expirationTime: new Date(Date.now() + 86400000).toISOString(),
    isRevoked: false,
    status: 'ACTIVE',
    createdAt: new Date().toISOString()
  };
  db.saveAuthorization(auth);

  await t.test('1. Visible Browser Creation with Stable Session IDs', async () => {
    const session = await orchestrator.getBrowserManager().createVisibleBrowserSession(
      { launchMode: 'VISIBLE_SUPERVISED', runId: 'run_vis_1' },
      auth
    );

    assert.ok(session.sessionId, 'Session must have a non-empty sessionId');
    assert.strictEqual(session.launchMode, 'VISIBLE_SUPERVISED');
    assert.strictEqual(session.isHeadless, false, 'Supervised browser must be headful');
    assert.ok(orchestrator.getBrowserManager().isSessionAlive(session.sessionId));

    // Cleanup session
    await orchestrator.getBrowserManager().closeSession(session.sessionId);
  });

  await t.test('2. Blocker Detection Pauses and Preserves Browser Session', async () => {
    const challengeUrl = 'http://127.0.0.1:4173/challenge';
    const runId = `run_pause_preserve_${Date.now()}`;

    const task = {
      id: `task_preserve_${Date.now()}`,
      title: 'Preserve Session on Blocker',
      description: 'Test session preservation',
      targetUrl: challengeUrl,
      sourcePlatform: 'TEST_IO_IMPORT',
      status: 'READY' as const,
      executionMode: 'SUPERVISED_MODE' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.saveTask(task);

    // Launch run in background asynchronously
    const runPromise = orchestrator.executeAgentLoop(runId, undefined, {
      targetUrl: challengeUrl,
      taskId: task.id,
      authorizationId: auth.id
    });

    // Wait for the orchestrator to detect challenge and pause
    let pausedState = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const st = orchestrator.getRunState(runId);
      if (st && st.status === 'AWAITING_HUMAN_VERIFICATION') {
        pausedState = st;
        break;
      }
    }

    assert.ok(pausedState, 'Run should reach AWAITING_HUMAN_VERIFICATION');
    assert.strictEqual(pausedState.status, 'AWAITING_HUMAN_VERIFICATION');
    assert.strictEqual(pausedState.isPaused, true);
    assert.strictEqual(pausedState.currentStep, 0, 'No functional test should be executed before challenge solved');
    assert.strictEqual(pausedState.candidateBugs.length, 0);

    // Verify browser session is ALIVE and NOT closed
    assert.ok(pausedState.activeBrowserSessionId);
    const isAlive = orchestrator.getBrowserManager().isSessionAlive(pausedState.activeBrowserSessionId);
    assert.strictEqual(isAlive, true, 'Browser session must remain ALIVE during human verification pause');

    // Clean up by cancelling
    await orchestrator.emergencyStop(runId);
    await runPromise.catch(() => {});
  });

  await t.test('3. Human Takeover pauses Playwright and transfers control', async () => {
    const challengeUrl = 'http://127.0.0.1:4173/challenge';
    const runId = `run_takeover_${Date.now()}`;

    const task = {
      id: `task_takeover_${Date.now()}`,
      title: 'Human Takeover Coordination',
      description: 'Test human takeover',
      targetUrl: challengeUrl,
      sourcePlatform: 'TEST_IO_IMPORT',
      status: 'READY' as const,
      executionMode: 'SUPERVISED_MODE' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.saveTask(task);

    const runPromise = orchestrator.executeAgentLoop(runId, undefined, {
      targetUrl: challengeUrl,
      taskId: task.id,
      authorizationId: auth.id
    });

    // Wait for awaiting status
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 200));
      if (orchestrator.getRunState(runId)?.status === 'AWAITING_HUMAN_VERIFICATION') break;
    }

    // Trigger human takeover
    const takeoverResult = await orchestrator.releaseControlToHuman(runId, 'Operator clicked takeover');
    assert.strictEqual(takeoverResult.success, true);
    assert.strictEqual(takeoverResult.ownership, 'HUMAN');

    const stateAfterTakeover = orchestrator.getRunState(runId);
    assert.strictEqual(stateAfterTakeover?.controlOwnership, 'HUMAN');
    assert.strictEqual(stateAfterTakeover?.status, 'HUMAN_CONTROL_ACTIVE');
    assert.strictEqual(stateAfterTakeover?.isPaused, true);

    // Clean up
    await orchestrator.emergencyStop(runId);
    await runPromise.catch(() => {});
  });

  await t.test('4. Check Page Again detects ongoing challenge and prevents resume', async () => {
    const challengeUrl = 'http://127.0.0.1:4173/challenge';
    const runId = `run_check_block_${Date.now()}`;

    const task = {
      id: `task_check_block_${Date.now()}`,
      title: 'Check Page while blocked',
      description: 'Verify check page returns blocked when challenge remains',
      targetUrl: challengeUrl,
      sourcePlatform: 'TEST_IO_IMPORT',
      status: 'READY' as const,
      executionMode: 'SUPERVISED_MODE' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.saveTask(task);

    const runPromise = orchestrator.executeAgentLoop(runId, undefined, {
      targetUrl: challengeUrl,
      taskId: task.id,
      authorizationId: auth.id
    });

    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 200));
      if (orchestrator.getRunState(runId)?.status === 'AWAITING_HUMAN_VERIFICATION') break;
    }

    // Execute checkPageAgain
    const checkResult = await orchestrator.checkPageAgain(runId);
    assert.strictEqual(checkResult.isBlocked, true);
    assert.strictEqual(checkResult.canResume, false);
    assert.ok(checkResult.blockerReason?.includes('Cloudflare Turnstile'));

    const readiness = await orchestrator.validateResumeReadiness(runId);
    assert.strictEqual(readiness.canResume, false);
    assert.strictEqual(readiness.pageReady, false);

    // Attempting to resume must fail
    await assert.rejects(
      async () => orchestrator.resumeAfterHumanVerification(runId),
      /Cannot resume/
    );

    await orchestrator.emergencyStop(runId);
    await runPromise.catch(() => {});
  });

  await t.test('5. Manual Interaction on Fixture, Successful Recheck, and Same-Session Resume', async () => {
    const challengeUrl = 'http://127.0.0.1:4173/challenge';
    const runId = `run_full_cycle_${Date.now()}`;

    const task = {
      id: `task_full_cycle_${Date.now()}`,
      title: 'Full Human Verification Cycle',
      description: 'End to end human solve and same session resume',
      targetUrl: challengeUrl,
      sourcePlatform: 'TEST_IO_IMPORT',
      status: 'READY' as const,
      executionMode: 'SUPERVISED_MODE' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.saveTask(task);

    const runPromise = orchestrator.executeAgentLoop(runId, undefined, {
      targetUrl: challengeUrl,
      taskId: task.id,
      authorizationId: auth.id
    });

    // Wait for pause
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 200));
      if (orchestrator.getRunState(runId)?.status === 'AWAITING_HUMAN_VERIFICATION') break;
    }

    const runState = orchestrator.getRunState(runId);
    const initialSessionId = runState?.activeBrowserSessionId;
    assert.ok(initialSessionId);

    // Simulate HUMAN operator interacting directly with the visible page
    const pageObj = orchestrator.getBrowserManager().getSessionFirstPage(initialSessionId);
    assert.ok(pageObj, 'Active Playwright Page must be accessible');

    // Human operator clicks the manual verification button in the browser
    await pageObj.page.click('#btn-solve-challenge');
    await pageObj.page.waitForLoadState('domcontentloaded');

    // Operator clicks Check Page Again
    const checkResult = await orchestrator.checkPageAgain(runId);
    assert.strictEqual(checkResult.isBlocked, false, 'Blocker must no longer be present');
    assert.strictEqual(checkResult.isReady, true, 'Application must be ready');
    assert.strictEqual(checkResult.canResume, true, 'canResume must be true');

    // Validate readiness
    const readiness = await orchestrator.validateResumeReadiness(runId);
    assert.strictEqual(readiness.canResume, true);
    assert.strictEqual(readiness.sessionAlive, true);

    // Operator clicks Resume AI Testing
    const resumed = await orchestrator.resumeAfterHumanVerification(runId);
    assert.strictEqual(resumed, true);

    // Wait for execution loop to finish on the SAME session
    const finalResult = await runPromise;
    assert.ok(finalResult.finalStatus === 'COMPLETED' || finalResult.finalStatus === 'COMPLETED_WITH_FINDINGS' || finalResult.finalStatus === 'PARTIAL');

    // Verify session identity was preserved across entire lifecycle
    const postRunState = orchestrator.getRunState(runId);
    assert.strictEqual(postRunState?.activeBrowserSessionId, initialSessionId, 'Browser session ID must remain IDENTICAL');
    assert.ok((finalResult.totalStepsExecuted || 0) >= 1, 'Functional tests should now execute');
  });

  await t.test('6. Manual-Only Tasks Prohibit Autonomous Resume', async () => {
    const challengeUrl = 'http://127.0.0.1:4173/challenge';
    const runId = `run_manual_only_${Date.now()}`;

    const task = {
      id: `task_manual_only_${Date.now()}`,
      title: 'Manual Only Program Task',
      description: 'Autonomous execution strictly restricted',
      targetUrl: challengeUrl,
      sourcePlatform: 'TEST_IO_IMPORT',
      status: 'READY' as const,
      executionMode: 'MANUAL_ONLY' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.saveTask(task);

    const runPromise = orchestrator.executeAgentLoop(runId, undefined, {
      targetUrl: challengeUrl,
      taskId: task.id,
      authorizationId: auth.id
    });

    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 200));
      if (orchestrator.getRunState(runId)?.status === 'AWAITING_HUMAN_VERIFICATION') break;
    }

    const readiness = await orchestrator.validateResumeReadiness(runId);
    assert.strictEqual(readiness.canResume, false, 'Must NOT permit resume on MANUAL_ONLY task');
    assert.ok(readiness.reason?.includes('MANUAL_ONLY'));

    await orchestrator.emergencyStop(runId);
    await runPromise.catch(() => {});
  });

  await t.test('7. Emergency Stop Cancels Waiting and Safely Closes Browser', async () => {
    const challengeUrl = 'http://127.0.0.1:4173/challenge';
    const runId = `run_emergency_stop_${Date.now()}`;

    const task = {
      id: `task_em_stop_${Date.now()}`,
      title: 'Emergency Stop during Pause',
      description: 'Cancel waiting operation',
      targetUrl: challengeUrl,
      sourcePlatform: 'TEST_IO_IMPORT',
      status: 'READY' as const,
      executionMode: 'SUPERVISED_MODE' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.saveTask(task);

    const runPromise = orchestrator.executeAgentLoop(runId, undefined, {
      targetUrl: challengeUrl,
      taskId: task.id,
      authorizationId: auth.id
    });

    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 200));
      if (orchestrator.getRunState(runId)?.status === 'AWAITING_HUMAN_VERIFICATION') break;
    }

    const activeSessionId = orchestrator.getRunState(runId)?.activeBrowserSessionId;
    assert.ok(activeSessionId);

    // Trigger Emergency Stop
    const stopResult = await orchestrator.emergencyStop(runId);
    assert.strictEqual(stopResult.stopped, true);

    const result = await runPromise;
    assert.strictEqual(result.finalStatus, 'CANCELLED');

    // Verify browser session is closed
    const isAlive = orchestrator.getBrowserManager().isSessionAlive(activeSessionId);
    assert.strictEqual(isAlive, false, 'Emergency stop must close owned browser resources');
  });

  // Final cleanup
  db.close();
  if (demoServer.listening) {
    demoServer.close();
  }
});
