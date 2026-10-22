import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentStudioDatabase } from '@test-io-agent/storage';
import { AgentOrchestrator } from '@test-io-agent/agent-core';
import { defaultMcpRuntimeService } from '@test-io-agent/windows-mcp-adapter';
import { createLocalApiServer } from './local_server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let db: AgentStudioDatabase;
let orchestrator: AgentOrchestrator;
let localServer: any = null;

function createWindow() {
  db = new AgentStudioDatabase('./data/agent_studio.db');
  db.seedDemoTasksIfEmpty();
  orchestrator = new AgentOrchestrator(db);

  // Also start local API server on 127.0.0.1:3001 so browser tabs can also connect
  try {
    localServer = createLocalApiServer(db, orchestrator, 3001);
  } catch (e) {
    console.warn('[Desktop Main] Local API server port 3001 already in use or started:', e);
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0a0e1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:3000';
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Setup IPC Handlers
  ipcMain.handle('metrics:get', () => {
    return db.getDashboardMetrics();
  });

  ipcMain.handle('tasks:list', () => {
    return db.listTasks();
  });

  ipcMain.handle('tasks:plan', (_, taskId: string) => {
    return db.getTestPlanForTask(taskId);
  });

  ipcMain.handle('tasks:import', async (_, taskInput) => {
    const analysis = await orchestrator.analyzeTask({
      title: taskInput.title,
      description: taskInput.description,
      targetUrl: taskInput.targetUrl,
      targetApp: taskInput.targetApp,
      cycleId: taskInput.cycleId,
      sourcePlatform: taskInput.sourcePlatform || 'TEST_IO_MANUAL_IMPORT'
    });
    const plan = await orchestrator.generateTestPlan(analysis);
    const task = db.getTask(analysis.taskId);
    return { task, analysis, plan };
  });

  ipcMain.handle('run:start', async (_, payload) => {
    // Run asynchronously so UI does not block
    const runPromise = orchestrator.executeAgentLoop(payload.runId, undefined, {
      targetUrl: payload.targetUrl,
      taskId: payload.taskId,
      authorizationId: payload.authorizationId
    });
    runPromise.catch((err) => {
      console.error(`[Main IPC] Error during run ${payload.runId}:`, err);
    });
    return { runId: payload.runId, status: 'RUNNING' };
  });

  ipcMain.handle('run:pause', async (_, runId) => {
    return orchestrator.pauseRun(runId);
  });

  ipcMain.handle('run:resume', async (_, runId) => {
    return orchestrator.resumeRun(runId);
  });

  ipcMain.handle('run:stop', async (_, runId) => {
    return orchestrator.emergencyStop(runId);
  });

  ipcMain.handle('run:state', async (_, runId) => {
    return orchestrator.getRunState(runId);
  });

  ipcMain.handle('run:logs', async (_, runId) => {
    return orchestrator.getRunLogs(runId);
  });

  ipcMain.handle('mcp:status', async () => {
    return defaultMcpRuntimeService.getWindowsMcpStatus();
  });

  ipcMain.handle('mcp:connect', async () => {
    await defaultMcpRuntimeService.connectWindowsMcp();
    return defaultMcpRuntimeService.getWindowsMcpStatus();
  });

  ipcMain.handle('mcp:disconnect', async () => {
    await defaultMcpRuntimeService.disconnectWindowsMcp();
    return { success: true };
  });

  ipcMain.handle('mcp:takeover', async (_, active: boolean) => {
    return defaultMcpRuntimeService.handleHumanTakeover(active);
  });

  ipcMain.handle('shell:openExternal', async (_, url: string) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('Forbidden URL scheme');
    }
    const host = parsed.hostname.toLowerCase();
    if (host !== 'tester.test.io' && !host.endsWith('.test.io') && host !== 'localhost' && host !== '127.0.0.1') {
      throw new Error(`Opening destination '${host}' is not permitted.`);
    }
    await shell.openExternal(url);
    return { success: true };
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (localServer) {
    try {
      localServer.close();
    } catch (_) {}
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
