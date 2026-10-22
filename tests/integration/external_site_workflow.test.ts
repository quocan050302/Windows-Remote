import test from 'node:test';
import * as assert from 'node:assert';
import * as http from 'node:http';
import { AgentStudioDatabase } from '../../packages/storage/src/database.js';
import { AgentOrchestrator } from '../../packages/agent-core/src/orchestrator.js';
import { server as demoServer } from '../../apps/demo-testing-lab/server.js';

test('Integration: External Website Testing Workflow vs Demo Lab', async () => {
  // 1. Setup mock external website server on port 4188
  const EXTERNAL_PORT = 4188;
  const externalServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>External Partner Portal - Charter & Fleet</title>
        </head>
        <body style="font-family: sans-serif; padding: 20px;">
          <header>
            <nav>
              <a href="#destinations" data-testid="nav-destinations">Destinations</a>
              <a href="#boats" data-testid="nav-boats">Fleet</a>
              <a href="#contact" data-testid="nav-contact">Contact</a>
            </nav>
          </header>
          <main>
            <h1>Discover Mediterranean Boat Charters</h1>
            <div>
              <input type="text" id="search-input" data-testid="search-input" placeholder="Search destination (e.g. Ibiza)..." />
              <button id="search-btn" data-testid="search-button">Search Fleet</button>
            </div>
            <div id="results">
              <p>Over 1,200 verified catamaran and sailboat charters available.</p>
            </div>
          </main>
          <footer>
            <p>&copy; 2026 External Partner Corp. All rights reserved.</p>
          </footer>
        </body>
      </html>
    `);
  });

  await new Promise<void>((resolve) => externalServer.listen(EXTERNAL_PORT, '127.0.0.1', () => resolve()));

  // 2. Setup Demo Lab server on 4173
  let startedDemoServer = false;
  if (!demoServer.listening) {
    try {
      await new Promise<void>((resolve, reject) => {
        demoServer.once('error', (err: any) => {
          if (err.code === 'EADDRINUSE') resolve();
          else reject(err);
        });
        demoServer.listen(4173, '127.0.0.1', () => {
          startedDemoServer = true;
          resolve();
        });
      });
    } catch (_) {}
  }

  const db = new AgentStudioDatabase(':memory:');
  db.seedDemoTasksIfEmpty();
  const orchestrator = new AgentOrchestrator(db);

  try {
    const externalTargetUrl = `http://127.0.0.1:${EXTERNAL_PORT}`;

    // Step A: Attempt testing external site without authorization
    // Note: Default authorization only covers 127.0.0.1:4173 Demo Lab and localhost without port
    // Let's verify evaluateTargetAuthorization against externalTargetUrl
    const unauthEval = db.evaluateTargetAuthorization('https://www.nautal.com/en/');
    assert.strictEqual(unauthEval.authorized, false);
    assert.ok(unauthEval.reason?.includes('AUTHORIZATION_REQUIRED') || unauthEval.reason?.includes('nautal.com'));

    // Step B: Record verified authorization for the external domain
    const authRecord = db.createVerifiedAuthorization({
      domain: `127.0.0.1:${EXTERNAL_PORT}`,
      grantingParty: 'External Fleet Owner / Customer Lead',
      scope: 'Navigation, Header Search, and Responsive Layout QA',
      allowedActions: ['click', 'fill', 'navigate', 'scroll'],
      expiresAt: new Date(Date.now() + 3600000).toISOString()
    });

    assert.ok(authRecord.id);
    assert.strictEqual(authRecord.status, 'ACTIVE');

    // Step C: Verify authorization status
    const verifiedEval = db.evaluateTargetAuthorization(externalTargetUrl);
    assert.strictEqual(verifiedEval.authorized, true);
    assert.strictEqual(verifiedEval.authorization?.id, authRecord.id);

    // Step D: Run test against the external target
    const externalTask = {
      id: 'task_ext_fleet',
      title: 'Partner Fleet Portal Exploratory Test',
      description: 'Audit header navigation links and destination search input on partner charter website.',
      targetUrl: externalTargetUrl,
      sourcePlatform: 'TEST_IO_IMPORT',
      status: 'READY' as const,
      executionMode: 'COPILOT_MODE' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.saveTask(externalTask);

    const runResult = await orchestrator.executeAgentLoop(`run_ext_${Date.now()}`, undefined, {
      targetUrl: externalTargetUrl,
      taskId: externalTask.id,
      maxSteps: 4
    });

    assert.strictEqual(runResult.finalStatus, 'COMPLETED');
    assert.ok(runResult.totalStepsExecuted >= 2);

    // Step E: Ensure Demo Lab-specific assumptions (e.g. 79.98 cart discrepancy) were NOT injected
    const bugs = db.listCandidateBugs(runResult.runId);
    const hasFakeDemoBug = bugs.some(b => b.title.includes('Cart') && b.actualResult?.includes('79.98'));
    assert.strictEqual(hasFakeDemoBug, false, 'Generic external website runs must not inherit hardcoded 79.98 cart expectations');

    // Step F: Verify Demo Lab still functions with mathematical cart defect detection
    const demoTask = db.getTask('task_demo_1');
    assert.ok(demoTask);

    const demoRunResult = await orchestrator.executeAgentLoop(`run_demo_${Date.now()}`, undefined, {
      targetUrl: 'http://127.0.0.1:4173',
      taskId: 'task_demo_1',
      maxSteps: 5
    });

    assert.strictEqual(demoRunResult.finalStatus, 'COMPLETED');
    const demoBugs = db.listCandidateBugs(demoRunResult.runId);
    assert.ok(demoBugs.length >= 1, 'Demo Lab cart calculation defect must still be detected on Demo Lab target');
  } finally {
    await new Promise<void>((resolve) => externalServer.close(() => resolve()));
    if (startedDemoServer) {
      await new Promise<void>((resolve) => demoServer.close(() => resolve()));
    }
    db.close();
  }
});
