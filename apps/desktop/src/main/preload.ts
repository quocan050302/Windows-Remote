import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  startRun: (payload: { runId: string; targetUrl?: string; taskId?: string }) =>
    ipcRenderer.invoke('run:start', payload),
  pauseRun: (runId: string) => ipcRenderer.invoke('run:pause', runId),
  stopRun: (runId: string) => ipcRenderer.invoke('run:stop', runId),
  getMetrics: () => ipcRenderer.invoke('metrics:get'),
  listTasks: () => ipcRenderer.invoke('tasks:list'),
  getAuditLogs: () => ipcRenderer.invoke('audit:list')
});
