import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentStudioDatabase } from '@test-io-agent/storage';
import { AgentOrchestrator, AiRuntimeManager } from '@test-io-agent/agent-core';
import { defaultMcpRuntimeService } from '@test-io-agent/windows-mcp-adapter';
import { createLocalApiServer } from './local_server.js';
import { SecretStore } from './services/secret_store.js';
import { SettingsService } from './services/settings_service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let db: AgentStudioDatabase;
let secretStore: SecretStore;
let settingsService: SettingsService;
let orchestrator: AgentOrchestrator;
let localServer: any = null;

function createWindow() {
  db = new AgentStudioDatabase('./data/agent_studio.db');
  db.seedDemoTasksIfEmpty();

  secretStore = new SecretStore();
  settingsService = new SettingsService(db, secretStore);

  // Wire AiRuntimeManager to dynamically retrieve active provider configuration
  const aiRuntimeManager = new AiRuntimeManager(
    () => settingsService.getActiveProviderConfiguration()
  );

  orchestrator = new AgentOrchestrator(db, undefined, aiRuntimeManager);

  // Start local API server on 127.0.0.1:3001
  try {
    localServer = createLocalApiServer(db, orchestrator, settingsService, 3001);
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

  // Setup IPC Handlers: Metrics & Tasks
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

  // Run lifecycle
  ipcMain.handle('run:start', async (_, payload) => {
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

  // Windows-MCP Adapter
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

  // Settings V2.0 IPC Handlers
  ipcMain.handle('settings:getPublic', async () => {
    return settingsService.getPublicSettings();
  });

  ipcMain.handle('settings:saveProviderKey', async (_, { providerId, key }) => {
    return settingsService.saveProviderKey(providerId, key);
  });

  ipcMain.handle('settings:testProviderConnection', async (_, { providerId, draftKey }) => {
    return settingsService.testProviderConnection(providerId, draftKey);
  });

  ipcMain.handle('settings:removeProviderKey', async (_, providerId) => {
    return settingsService.removeProviderKey(providerId);
  });

  ipcMain.handle('settings:activateProvider', async (_, providerId) => {
    const res = await settingsService.activateProvider(providerId);
    await orchestrator.getRuntimeManager().syncWithSettings();
    return res;
  });

  ipcMain.handle('settings:update', async (_, req) => {
    const res = await settingsService.updateSettings(req);
    await orchestrator.getRuntimeManager().syncWithSettings();
    return res;
  });

  ipcMain.handle('settings:getActiveAiStatus', async () => {
    return orchestrator.getActiveAiRuntimeStatus();
  });

  // Safe external URL launching
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
