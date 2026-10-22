import * as http from 'node:http';
import { URL } from 'node:url';
import { exec } from 'node:child_process';
import { AgentStudioDatabase } from '@test-io-agent/storage';
import { AgentOrchestrator } from '@test-io-agent/agent-core';
import { defaultMcpRuntimeService } from '@test-io-agent/windows-mcp-adapter';

export function createLocalApiServer(
  db: AgentStudioDatabase,
  orchestrator: AgentOrchestrator,
  port: number = 3001
): http.Server {
  const server = http.createServer(async (req, res) => {
    // 1. Strict Security & Origin Guard
    const origin = req.headers.origin || '';
    const isAllowedOrigin =
      origin === 'http://localhost:3000' ||
      origin === 'http://127.0.0.1:3000' ||
      origin === 'http://localhost:4173' ||
      origin === 'http://127.0.0.1:4173' ||
      origin === '';

    if (!isAllowedOrigin && origin) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden origin' }));
      return;
    }

    // CORS Headers strictly for local development
    res.setHeader('Access-Control-Allow-Origin', origin || 'http://localhost:3000');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const reqUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1:3001'}`);
    const pathname = reqUrl.pathname;

    const readBody = async (): Promise<any> => {
      return new Promise((resolve) => {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk.toString();
        });
        req.on('end', () => {
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch {
            resolve({});
          }
        });
      });
    };

    const sendJson = (statusCode: number, data: any) => {
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    try {
      // Health / Runtime detection
      if (req.method === 'GET' && pathname === '/api/health') {
        sendJson(200, {
          status: 'ok',
          runtime: 'browser-local-api',
          version: '1.0.0',
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Metrics
      if (req.method === 'GET' && pathname === '/api/metrics') {
        const metrics = db.getDashboardMetrics();
        sendJson(200, metrics);
        return;
      }

      // Tasks: List
      if (req.method === 'GET' && pathname === '/api/tasks') {
        db.seedDemoTasksIfEmpty();
        const tasks = db.listTasks();
        sendJson(200, tasks);
        return;
      }

      // Tasks: Import / Create
      if (req.method === 'POST' && pathname === '/api/tasks') {
        const body = await readBody();
        if (!body.title || !body.description) {
          sendJson(400, { error: 'Task title and description are required.' });
          return;
        }

        const analysis = await orchestrator.analyzeTask({
          title: body.title,
          description: body.description,
          targetUrl: body.targetUrl,
          targetApp: body.targetApp,
          cycleId: body.cycleId,
          sourcePlatform: body.sourcePlatform || 'TEST_IO_MANUAL_IMPORT'
        });

        // Also generate test plan automatically
        const plan = await orchestrator.generateTestPlan(analysis);

        const created = db.getTask(analysis.taskId);
        sendJson(201, { task: created, analysis, plan });
        return;
      }

      // Tasks: Plan
      if (req.method === 'GET' && pathname.startsWith('/api/tasks/') && pathname.endsWith('/plan')) {
        const parts = pathname.split('/');
        const taskId = parts[3];
        const plan = db.getTestPlanForTask(taskId);
        sendJson(200, plan || { taskId, steps: [] });
        return;
      }

      // Run: Start
      if (req.method === 'POST' && pathname === '/api/run/start') {
        const body = await readBody();
        const runId = body.runId || `run_${Date.now()}`;
        
        // Execute asynchronously
        orchestrator.executeAgentLoop(runId, undefined, {
          targetUrl: body.targetUrl,
          taskId: body.taskId,
          authorizationId: body.authorizationId
        }).catch((err) => {
          console.error(`[LocalServer] Error in agent run ${runId}:`, err);
        });

        sendJson(200, { runId, status: 'RUNNING' });
        return;
      }

      // Run: Pause
      if (req.method === 'POST' && pathname === '/api/run/pause') {
        const body = await readBody();
        const ok = await orchestrator.pauseRun(body.runId);
        sendJson(200, { success: ok });
        return;
      }

      // Run: Resume
      if (req.method === 'POST' && pathname === '/api/run/resume') {
        const body = await readBody();
        const ok = await orchestrator.resumeRun(body.runId);
        sendJson(200, { success: ok });
        return;
      }

      // Run: Stop
      if (req.method === 'POST' && pathname === '/api/run/stop') {
        const body = await readBody();
        const stopRes = await orchestrator.emergencyStop(body.runId);
        sendJson(200, stopRes);
        return;
      }

      // Run: State
      if (req.method === 'GET' && pathname.startsWith('/api/run/') && pathname.endsWith('/state')) {
        const parts = pathname.split('/');
        const runId = parts[3];
        const state = orchestrator.getRunState(runId);
        sendJson(200, state || { runId, status: 'NOT_FOUND' });
        return;
      }

      // Run: Logs
      if (req.method === 'GET' && pathname.startsWith('/api/run/') && pathname.endsWith('/logs')) {
        const parts = pathname.split('/');
        const runId = parts[3];
        const logs = orchestrator.getRunLogs(runId);
        sendJson(200, { runId, logs });
        return;
      }

      // MCP: Status
      if (req.method === 'GET' && pathname === '/api/mcp/status') {
        const status = await defaultMcpRuntimeService.getWindowsMcpStatus();
        sendJson(200, status);
        return;
      }

      // MCP: Connect
      if (req.method === 'POST' && pathname === '/api/mcp/connect') {
        try {
          await defaultMcpRuntimeService.connectWindowsMcp();
          const status = await defaultMcpRuntimeService.getWindowsMcpStatus();
          sendJson(200, status);
        } catch (err: any) {
          sendJson(500, { error: err?.message || String(err) });
        }
        return;
      }

      // MCP: Disconnect
      if (req.method === 'POST' && pathname === '/api/mcp/disconnect') {
        await defaultMcpRuntimeService.disconnectWindowsMcp();
        sendJson(200, { success: true });
        return;
      }

      // MCP: Human Takeover
      if (req.method === 'POST' && pathname === '/api/mcp/takeover') {
        const body = await readBody();
        const resTakeover = await defaultMcpRuntimeService.handleHumanTakeover(Boolean(body.active));
        sendJson(200, resTakeover);
        return;
      }

      // External Browser Launch (Test IO Safe Opener)
      if (req.method === 'POST' && pathname === '/api/open-external') {
        const body = await readBody();
        const urlToOpen = String(body.url || '');

        // URL Validation
        const parsed = new URL(urlToOpen);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
          sendJson(400, { error: 'Invalid URL protocol.' });
          return;
        }

        // Must be tester.test.io or http://127.0.0.1
        const host = parsed.hostname.toLowerCase();
        if (host !== 'tester.test.io' && !host.endsWith('.test.io') && host !== 'localhost' && host !== '127.0.0.1') {
          sendJson(403, { error: 'Opening this external destination is not permitted.' });
          return;
        }

        // Open in user default OS browser
        const cmd = process.platform === 'win32' ? `start "" "${urlToOpen}"` : `open "${urlToOpen}"`;
        exec(cmd, (err) => {
          if (err) {
            sendJson(500, { error: 'Failed to launch default browser.' });
          } else {
            sendJson(200, { success: true, url: urlToOpen });
          }
        });
        return;
      }

      sendJson(404, { error: 'Endpoint not found' });
    } catch (err: any) {
      sendJson(500, { error: err?.message || String(err) });
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`[Test IO Studio] Local Desktop Backend API active on http://127.0.0.1:${port}`);
  });

  return server;
}

// Standalone execution support
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const db = new AgentStudioDatabase('./data/agent_studio.db');
  db.seedDemoTasksIfEmpty();
  const orchestrator = new AgentOrchestrator(db);
  createLocalApiServer(db, orchestrator, 3001);
}
