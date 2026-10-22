import test from 'node:test';
import * as assert from 'node:assert';
import { AgentStudioDatabase } from '../../packages/storage/src/database.js';
import { AgentOrchestrator } from '../../packages/agent-core/src/orchestrator.js';
import { createLocalApiServer } from '../../apps/desktop/src/main/local_server.js';

test('Local Backend API Integration - Handles health, tasks import, plans and security validation', async () => {
  const db = new AgentStudioDatabase(':memory:');
  const orchestrator = new AgentOrchestrator(db);
  const PORT = 3009;
  const server = createLocalApiServer(db, orchestrator, PORT);

  try {
    const baseUrl = `http://127.0.0.1:${PORT}`;

    // 1. Health Endpoint
    const resHealth = await fetch(`${baseUrl}/api/health`);
    assert.strictEqual(resHealth.status, 200);
    const healthJson = await resHealth.json();
    assert.strictEqual(healthJson.status, 'ok');
    assert.strictEqual(healthJson.runtime, 'browser-local-api');

    // 2. Metrics Endpoint
    const resMetrics = await fetch(`${baseUrl}/api/metrics`);
    assert.strictEqual(resMetrics.status, 200);
    const metricsJson = await resMetrics.json();
    assert.ok(typeof metricsJson.taskCount === 'number');

    // 3. Tasks List Endpoint
    const resTasks = await fetch(`${baseUrl}/api/tasks`);
    assert.strictEqual(resTasks.status, 200);
    const tasks = await resTasks.json();
    assert.ok(Array.isArray(tasks));

    // 4. Tasks Import / Creation Endpoint
    const resImport = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Cart Total Verification Task',
        description: 'Verify shopping cart total calculation. In-scope: Cart addition. Out-of-scope: Payment submission.',
        targetUrl: 'http://127.0.0.1:4173',
        sourcePlatform: 'TEST_IO_MANUAL_IMPORT'
      })
    });
    assert.strictEqual(resImport.status, 201);
    const importJson = await resImport.json();
    assert.ok(importJson.task?.id);
    assert.ok(importJson.analysis);
    assert.ok(importJson.plan?.steps?.length > 0);

    const importedTaskId = importJson.task.id;

    // 5. Task Plan Retrieval Endpoint
    const resPlan = await fetch(`${baseUrl}/api/tasks/${importedTaskId}/plan`);
    assert.strictEqual(resPlan.status, 200);
    const planJson = await resPlan.json();
    assert.strictEqual(planJson.taskId, importedTaskId);
    assert.ok(planJson.steps.length > 0);

    // 6. Security: Open External Link Scheme Validation
    const resBadScheme = await fetch(`${baseUrl}/api/open-external`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'javascript:alert(1)' })
    });
    assert.strictEqual(resBadScheme.status, 400);

    const resBadHost = await fetch(`${baseUrl}/api/open-external`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://malicious-external-site.com/exploit' })
    });
    assert.strictEqual(resBadHost.status, 403);

    // 7. MCP Status Endpoint
    const resMcp = await fetch(`${baseUrl}/api/mcp/status`);
    assert.strictEqual(resMcp.status, 200);
    const mcpJson = await resMcp.json();
    assert.ok('isConnected' in mcpJson);
  } finally {
    server.close();
    db.close();
  }
});
