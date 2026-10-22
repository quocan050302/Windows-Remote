import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentStudioDatabase } from '@test-io-agent/storage';
import { AgentOrchestrator } from '@test-io-agent/agent-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let db: AgentStudioDatabase;
let orchestrator: AgentOrchestrator;

function createWindow() {
  db = new AgentStudioDatabase('./data/agent_studio.db');
  orchestrator = new AgentOrchestrator(db);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#070a12',
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

  ipcMain.handle('run:start', async (_, payload) => {
    return orchestrator.executeAgentLoop(payload.runId, undefined, {
      targetUrl: payload.targetUrl,
      taskId: payload.taskId
    });
  });

  ipcMain.handle('run:stop', async (_, runId) => {
    return orchestrator.emergencyStop(runId);
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
