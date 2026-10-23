import test from 'node:test';
import * as assert from 'node:assert';
import { AgentStudioDatabase } from '../../packages/storage/src/database.js';
import { AgentOrchestrator } from '../../packages/agent-core/src/orchestrator.js';
import { server as demoServer } from '../../apps/demo-testing-lab/server.js';
import type { AuthorizationRecord, TaskRecord } from '../../packages/shared/src/index.js';

test('Acceptance: Full Homepage Functional Coverage on Local Fixture', async () => {
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
    const targetUrl = 'http://127.0.0.1:4173/';

    // 2. Setup verified authorization
    const auth: AuthorizationRecord = {
      id: `auth_homepage_${Date.now()}`,
      grantingOrgOrPerson: 'Test IO Customer Lead',
      verificationEvidence: 'Local fixture verified authorization',
      allowedDomains: ['127.0.0.1'],
      allowedActions: ['click', 'fill', 'navigate', 'scroll'],
      allowedDeviceTypes: ['Desktop Chrome'],
      scope: 'Homepage Functional & Regression Testing',
      startTime: new Date().toISOString(),
      expirationTime: new Date(Date.now() + 86400000).toISOString(),
      isRevoked: false,
      status: 'ACTIVE',
      createdAt: new Date().toISOString()
    };
    db.saveAuthorization(auth);

    // 3. Task with functional requirements
    const homepageTask: TaskRecord = {
      id: 'task_homepage_full',
      title: 'Homepage Functional Exploratory Test',
      description: 'Audit primary CTA buttons, promotional banners, featured product carousel, and FAQ accordion sections.',
      targetUrl,
      sourcePlatform: 'TEST_IO_IMPORT',
      status: 'READY',
      executionMode: 'COPILOT_MODE',
      analysis: {
        taskId: 'task_homepage_full',
        targetApplication: targetUrl,
        authorizedDomains: ['127.0.0.1'],
        taskType: 'EXPLORATORY',
        inScopeFeatures: ['Primary CTA Buttons', 'Hero Banner', 'Featured Product Carousel', 'FAQ Expandable Sections'],
        outOfScopeFeatures: ['Payment Checkout', 'tester.test.io'],
        riskLevel: 'LOW',
        requirements: ['Hero CTA buttons', 'Featured carousel', 'FAQ accordion'],
        requiredDevice: 'Desktop Chrome',
        reportingRequirements: ['Test IO bug report draft'],
        missingInformation: [],
        confidenceScore: 0.95
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.saveTask(homepageTask);

    // 4. Run the orchestrator with sufficient steps budget
    const runResult = await orchestrator.executeAgentLoop(`run_hp_${Date.now()}`, undefined, {
      targetUrl,
      taskId: homepageTask.id,
      authorizationId: auth.id,
      maxSteps: 8
    });

    // 5. Assertions matching Requirement 26:
    // All applicable requirements mapped
    assert.ok(runResult.coverageMatrix, 'Coverage matrix must be generated');
    assert.ok(runResult.coverageMatrix.totalRequirements >= 3, `Expected at least 3 requirements mapped, got ${runResult.coverageMatrix.totalRequirements}`);

    // Multiple scenarios generated & functional actions performed
    assert.ok(runResult.totalStepsExecuted >= 2, `Expected at least 2 steps executed, got ${runResult.totalStepsExecuted}`);

    // Genuine evidence collected with categories
    const evidence = db.listEvidence(runResult.runId);
    assert.ok(evidence.length >= 2, `Expected at least 2 evidence records, got ${evidence.length}`);
    const functionalEvidence = evidence.filter(e => e.category === 'FUNCTIONAL_EVIDENCE');
    assert.ok(functionalEvidence.length > 0, 'Must have recorded functional verification evidence');

    // Coverage accurately calculated
    const coverageVal = runResult.coverageMatrix.coveragePercentage ?? Math.round(runResult.coverageMatrix.coverageRatio * 100);
    assert.strictEqual(typeof coverageVal, 'number');
    assert.ok(coverageVal >= 0 && coverageVal <= 100);

    // Status reflects actual coverage and defect state
    assert.ok(
      ['COMPLETED', 'COMPLETED_WITH_FINDINGS', 'PARTIAL'].includes(runResult.finalStatus),
      `Status must be COMPLETED, COMPLETED_WITH_FINDINGS, or PARTIAL, got ${runResult.finalStatus}`
    );

    // Test plan is saved and has fingerprint
    const savedPlan = db.getTestPlanForTask(homepageTask.id);
    assert.ok(savedPlan);
    assert.ok((savedPlan.planVersion || 0) >= 1);
    assert.ok(savedPlan.requirementsFingerprint);

  } finally {
    db.close();
    if (demoServer.listening) {
      demoServer.close();
    }
  }
});
