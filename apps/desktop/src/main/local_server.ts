import * as http from 'node:http';
import { URL } from 'node:url';
import { spawn } from 'node:child_process';
import { AgentStudioDatabase } from '@test-io-agent/storage';
import { AgentOrchestrator, AiRuntimeManager } from '@test-io-agent/agent-core';
import { defaultMcpRuntimeService } from '@test-io-agent/windows-mcp-adapter';
import { SecretStore } from './services/secret_store.js';
import { SettingsService } from './services/settings_service.js';

export function validateExternalUrl(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function createLocalApiServer(
  db: AgentStudioDatabase,
  orchestrator: AgentOrchestrator,
  settingsServiceOrPort?: SettingsService | number,
  port: number = 3001
): http.Server {
  let settings: SettingsService;
  let serverPort = port;

  if (typeof settingsServiceOrPort === 'number') {
    serverPort = settingsServiceOrPort;
    settings = new SettingsService(db);
  } else if (settingsServiceOrPort) {
    settings = settingsServiceOrPort;
  } else {
    settings = new SettingsService(db);
  }

  const server = http.createServer(async (req, res) => {
    // 1. Strict Security & Origin Guard
    const origin = req.headers.origin || '';
    const isAllowedOrigin =
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:') ||
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

      // Settings: Public Settings (Never exposes secrets)
      if (req.method === 'GET' && pathname === '/api/settings') {
        const publicSettings = await settings.getPublicSettings();
        sendJson(200, publicSettings);
        return;
      }

      // Settings: Update
      if (req.method === 'POST' && pathname === '/api/settings') {
        const body = await readBody();
        const updated = await settings.updateSettings(body);
        sendJson(200, updated);
        return;
      }

      // Settings: Test Connection
      if (req.method === 'POST' && pathname === '/api/settings/test-connection') {
        const body = await readBody();
        if (!body.providerId) {
          sendJson(400, { error: 'providerId is required.' });
          return;
        }
        const testResult = await settings.testProviderConnection(body.providerId, body.draftKey);
        sendJson(200, testResult);
        return;
      }

      // Settings: Save Provider Key
      if (req.method === 'POST' && pathname === '/api/settings/save-key') {
        const body = await readBody();
        if (!body.providerId || !body.key) {
          sendJson(400, { error: 'providerId and key are required.' });
          return;
        }
        const providerStatus = await settings.saveProviderKey(body.providerId, body.key);
        sendJson(200, providerStatus);
        return;
      }

      // Settings: Remove Provider Key
      if (req.method === 'POST' && pathname === '/api/settings/remove-key') {
        const body = await readBody();
        if (!body.providerId) {
          sendJson(400, { error: 'providerId is required.' });
          return;
        }
        const removed = await settings.removeProviderKey(body.providerId);
        sendJson(200, { success: removed });
        return;
      }

      // Settings: Activate Provider
      if (req.method === 'POST' && pathname === '/api/settings/activate') {
        const body = await readBody();
        if (!body.providerId) {
          sendJson(400, { error: 'providerId is required.' });
          return;
        }
        const activeRuntime = await settings.activateProvider(body.providerId);
        sendJson(200, activeRuntime);
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

      // Run: Focus Testing Browser
      if (req.method === 'POST' && pathname === '/api/run/focus-browser') {
        const body = await readBody();
        const result = await orchestrator.focusTestingBrowser(body.runId);
        sendJson(200, result);
        return;
      }

      // Run: Unified Human Takeover (Release or Reclaim)
      if (req.method === 'POST' && pathname === '/api/run/takeover') {
        const body = await readBody();
        const runId = body.runId;
        const active = Boolean(body.active ?? true);
        if (active) {
          const res = await orchestrator.releaseControlToHuman(runId, body.reason);
          // Also coordinate with Windows-MCP if connected
          await defaultMcpRuntimeService.handleHumanTakeover(true).catch(() => {});
          sendJson(200, res);
        } else {
          const res = await orchestrator.reclaimControlFromHuman(runId);
          await defaultMcpRuntimeService.handleHumanTakeover(false).catch(() => {});
          sendJson(200, res);
        }
        return;
      }

      // Run: Check Page Again (User observation check)
      if (req.method === 'POST' && pathname === '/api/run/check-page') {
        const body = await readBody();
        const result = await orchestrator.checkPageAgain(body.runId);
        sendJson(200, result);
        return;
      }

      // Run: Resume Readiness
      if (req.method === 'GET' && pathname.startsWith('/api/run/') && pathname.endsWith('/resume-readiness')) {
        const parts = pathname.split('/');
        const runId = parts[3];
        const readiness = await orchestrator.validateResumeReadiness(runId);
        sendJson(200, readiness);
        return;
      }

      // Run: Resume After Human Verification
      if (req.method === 'POST' && pathname === '/api/run/resume-verification') {
        const body = await readBody();
        try {
          const resumed = await orchestrator.resumeAfterHumanVerification(body.runId);
          sendJson(200, { success: resumed });
        } catch (err: any) {
          sendJson(400, { success: false, error: err.message || String(err) });
        }
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

      // External Browser Launch (Manual User Viewing - Safe Opener)
      if (req.method === 'POST' && pathname === '/api/open-external') {
        const body = await readBody();
        const urlToOpen = String(body.url || '');

        // URL Validation
        let parsed: URL;
        try {
          parsed = new URL(urlToOpen);
        } catch {
          sendJson(400, { error: 'Invalid URL format.' });
          return;
        }

        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
          sendJson(400, { error: 'Invalid or forbidden URL protocol scheme. Only HTTP and HTTPS are permitted.' });
          return;
        }

        // Safe URL launch via spawn array (no shell string interpolation)
        try {
          if (process.platform === 'win32') {
            spawn('cmd.exe', ['/c', 'start', '', urlToOpen], { detached: true, stdio: 'ignore' });
          } else if (process.platform === 'darwin') {
            spawn('open', [urlToOpen], { detached: true, stdio: 'ignore' });
          } else {
            spawn('xdg-open', [urlToOpen], { detached: true, stdio: 'ignore' });
          }
          sendJson(200, { success: true, url: urlToOpen });
        } catch (err: any) {
          sendJson(500, { error: err.message || 'Failed to open URL' });
        }
        return;
      }

      // Authorizations: List
      if (req.method === 'GET' && pathname === '/api/authorizations') {
        const list = orchestrator.listAuthorizations();
        sendJson(200, list);
        return;
      }

      // Authorizations: Evaluate Target URL
      if (req.method === 'POST' && pathname === '/api/authorizations/evaluate') {
        const body = await readBody();
        const result = orchestrator.evaluateTargetAuthorization(String(body.targetUrl || ''));
        sendJson(200, result);
        return;
      }

      // Authorizations: Get for Task
      if (req.method === 'GET' && pathname.startsWith('/api/tasks/') && pathname.endsWith('/authorization-status')) {
        const parts = pathname.split('/');
        const taskId = parts[3];
        const result = orchestrator.getAuthorizationStatusForTask(taskId);
        sendJson(200, result);
        return;
      }

      // Authorizations: Revoke
      if (req.method === 'POST' && pathname.startsWith('/api/authorizations/') && pathname.endsWith('/revoke')) {
        const parts = pathname.split('/');
        const id = parts[3];
        const body = await readBody();
        try {
          const revoked = orchestrator.revokeAuthorization(id, body.reason);
          sendJson(200, revoked);
        } catch (err: any) {
          sendJson(400, { error: err.message || 'Failed to revoke authorization' });
        }
        return;
      }

      // Authorizations: Get Single
      if (req.method === 'GET' && pathname.startsWith('/api/authorizations/')) {
        const parts = pathname.split('/');
        const id = parts[3];
        const auth = orchestrator.getAuthorization(id);
        if (!auth) {
          sendJson(404, { error: `Authorization '${id}' not found` });
          return;
        }
        sendJson(200, auth);
        return;
      }

      // Authorizations: Create
      if (req.method === 'POST' && pathname === '/api/authorizations') {
        const body = await readBody();
        try {
          const created = orchestrator.createVerifiedAuthorization(body);
          sendJson(201, created);
        } catch (err: any) {
          sendJson(400, { error: err.message || 'Failed to create authorization' });
        }
        return;
      }

      sendJson(404, { error: 'Endpoint not found' });
    } catch (err: any) {
      sendJson(500, { error: err?.message || String(err) });
    }
  });

  server.listen(serverPort, '127.0.0.1', () => {
    console.log(`[Test IO Studio] Local Desktop Backend API active on http://127.0.0.1:${serverPort}`);
  });

  return server;
}

// Standalone execution support
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const db = new AgentStudioDatabase('./data/agent_studio.db');
  db.seedDemoTasksIfEmpty();
  const secretStore = new SecretStore();
  const settingsService = new SettingsService(db, secretStore);
  const aiRuntimeManager = new AiRuntimeManager(
    () => settingsService.getActiveProviderConfiguration()
  );
  const orchestrator = new AgentOrchestrator(db, undefined, aiRuntimeManager);
  createLocalApiServer(db, orchestrator, settingsService, 3001);
}
