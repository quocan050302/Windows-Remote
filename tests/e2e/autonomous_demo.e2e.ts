import test from 'node:test';
import * as assert from 'node:assert';
import { AgentStudioDatabase } from '../../packages/storage/src/database.js';
import { AgentOrchestrator } from '../../packages/agent-core/src/orchestrator.js';
import { server as demoServer } from '../../apps/demo-testing-lab/server.js';

test('E2E Autonomous Demo Acceptance Test - Cart Calculation Defect Detection', async () => {
  console.log('\n--- STARTING E2E AUTONOMOUS DEMO ACCEPTANCE TEST ---');
  let startedServer = false;
  if (!demoServer.listening) {
    try {
      await new Promise<void>((resolve, reject) => {
        demoServer.once('error', (err: any) => {
          if (err.code === 'EADDRINUSE') {
            resolve();
          } else {
            reject(err);
          }
        });
        demoServer.listen(4173, '127.0.0.1', () => {
          startedServer = true;
          resolve();
        });
      });
    } catch (_) {}
  }

  const db = new AgentStudioDatabase(':memory:');
  const orchestrator = new AgentOrchestrator(db);

  const taskDescription = 'Kiểm tra chức năng giỏ hàng trên Demo Testing Lab. Không được thực hiện thanh toán.';
  console.log(`Task Input: "${taskDescription}"`);

  // 1. Analyze Task
  const analysis = await orchestrator.analyzeTask({
    title: 'Autonomous Cart Verification',
    description: taskDescription,
    targetUrl: 'http://127.0.0.1:4173'
  });

  console.log(`Classified Module Type: ${analysis.taskType}`);
  console.log(`In-Scope Features: ${analysis.inScopeFeatures.join(', ')}`);
  console.log(`Out-of-Scope Boundaries: ${analysis.outOfScopeFeatures.join(', ')}`);

  // 2. Generate Plan
  const plan = await orchestrator.generateTestPlan(analysis);
  console.log(`Generated Test Plan with ${plan.steps.length} steps:`);
  plan.steps.forEach((s) => console.log(`  Step ${s.stepNumber}: ${s.goal}`));

  // 3. Execute Autonomous Loop
  const runId = `run_e2e_${Date.now()}`;
  console.log(`\nLaunching live browser execution loop for run ${runId}...`);

  const runResult = await orchestrator.executeAgentLoop(runId, undefined, {
    targetUrl: 'http://127.0.0.1:4173',
    taskId: analysis.taskId,
    maxSteps: 5
  });

  console.log('\n--- EXECUTION RESULT SUMMARY ---');
  console.log(`Run Status: ${runResult.finalStatus}`);
  console.log(`Steps Executed: ${runResult.totalStepsExecuted}`);
  console.log(`Passed Steps: ${runResult.passedSteps}`);
  console.log(`Failed Steps: ${runResult.failedSteps}`);
  console.log(`Bugs Found: ${runResult.bugsFound}`);
  console.log(`Report Draft ID: ${runResult.reportId}`);

  assert.strictEqual(runResult.finalStatus, 'COMPLETED');
  assert.ok(runResult.totalStepsExecuted >= 3);
  assert.ok(runResult.bugsFound >= 1, 'Autonomous agent must detect the cart calculation defect');

  // Verify candidate bug details in DB
  const bugs = db.listCandidateBugs(runId);
  assert.ok(bugs.length >= 1);
  const cartBug = bugs[0];
  console.log(`\nDetected Bug: "${cartBug.title}"`);
  console.log(`Expected: ${cartBug.expectedResult}`);
  console.log(`Actual: ${cartBug.actualResult}`);
  assert.ok(cartBug.actualResult.includes('Cart total discrepancy') || cartBug.actualResult.includes('total'));

  // Verify evidence generated
  assert.ok(cartBug.evidenceIds.length > 0);
  const evidence = db.getEvidence(cartBug.evidenceIds[0]);
  assert.ok(evidence);
  console.log(`Evidence captured: ${evidence.filePath} (SHA-256: ${evidence.sha256Hash})`);

  // Verify Report Draft generated
  assert.ok(runResult.reportId);
  const report = db.getReportDraft(runResult.reportId);
  assert.ok(report);
  console.log(`Report Title: "${report.title}"`);
  console.log(`Report Status: ${report.status}`);
  console.log(`Steps to reproduce: ${report.stepsToReproduce.length} steps`);
  assert.strictEqual(report.status, 'READY_FOR_HUMAN_SUBMISSION');

  db.close();
  if (startedServer) {
    await new Promise<void>((resolve) => demoServer.close(() => resolve()));
  }
  console.log('--- E2E AUTONOMOUS DEMO ACCEPTANCE TEST PASSED ---\n');
});
