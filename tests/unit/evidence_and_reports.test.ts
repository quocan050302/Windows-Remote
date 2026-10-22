import test from 'node:test';
import * as assert from 'node:assert';
import * as crypto from 'node:crypto';
import { AgentStudioDatabase } from '../../packages/storage/src/database.js';
import { EvidenceService } from '../../packages/evidence/src/evidence_service.js';
import { generateReportDraft, validateReportDraft } from '../../packages/report-engine/src/report_generator.js';

test('Evidence Service - Computes valid SHA-256 hash and persists evidence', async () => {
  const db = new AgentStudioDatabase(':memory:');
  
  // Seed task and agent run for foreign key integrity
  db.saveTask({
    id: 'task_test_1',
    title: 'Test',
    description: 'Desc',
    sourcePlatform: 'TEST_IO',
    status: 'READY',
    executionMode: 'COPILOT_MODE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  (db as any).db.exec(`
    INSERT INTO agent_runs (id, task_id, status, mode, start_time)
    VALUES ('run_test_1', 'task_test_1', 'RUNNING', 'COPILOT_MODE', datetime('now'))
  `);

  const service = new EvidenceService(db, './data/evidence-test');

  const content = Buffer.from('FAKE_PNG_BINARY_CONTENT_FOR_TESTING');
  const expectedHash = crypto.createHash('sha256').update(content).digest('hex');

  const record = await service.captureEvidence('run_test_1', {
    type: 'SCREENSHOT',
    content,
    stepId: 'step_1'
  });

  assert.strictEqual(record.sha256Hash, expectedHash);
  assert.strictEqual(record.type, 'SCREENSHOT');
  assert.strictEqual(record.fileSizeBytes, content.length);

  const isValid = service.verifyIntegrity(record.id);
  assert.strictEqual(isValid, true);

  db.close();
});

test('Report Engine - Generates Test IO compliant draft and validates required fields', async () => {
  const draft = await generateReportDraft({
    taskId: 'task_demo_1',
    runId: 'run_demo_1',
    candidateBug: {
      id: 'bug_1',
      runId: 'run_demo_1',
      title: 'Cart Total calculation discrepancy on checkout drawer',
      severity: 'HIGH',
      expectedResult: 'Total should equal $79.98',
      actualResult: 'Total displayed is $29.99',
      pageUrl: 'http://127.0.0.1:4173',
      actionHistory: [],
      environment: 'Windows 11 / Chromium',
      evidenceIds: ['ev_1'],
      reproductionStatus: 'REPRODUCED',
      timestamp: new Date().toISOString()
    },
    evidenceRecords: [
      {
        id: 'ev_1',
        runId: 'run_demo_1',
        type: 'SCREENSHOT',
        filePath: 'd:/evidence/step_1.png',
        fileSizeBytes: 1234,
        sha256Hash: 'abcd1234abcd1234',
        isRedacted: false,
        capturedAt: new Date().toISOString()
      }
    ]
  });

  assert.ok(draft.title.includes('Cart'));
  assert.strictEqual(draft.status, 'READY_FOR_HUMAN_SUBMISSION');
  assert.strictEqual(draft.evidenceLinks.length, 1);

  const validation = validateReportDraft(draft);
  assert.strictEqual(validation.isValid, true);
  assert.strictEqual(validation.missingFields.length, 0);
});
