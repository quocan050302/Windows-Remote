import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  startRun: (payload: { runId: string; targetUrl?: string; taskId?: string; authorizationId?: string }) =>
    ipcRenderer.invoke('run:start', payload),
  pauseRun: (runId: string) => ipcRenderer.invoke('run:pause', runId),
  resumeRun: (runId: string) => ipcRenderer.invoke('run:resume', runId),
  stopRun: (runId: string) => ipcRenderer.invoke('run:stop', runId),
  getRunState: (runId: string) => ipcRenderer.invoke('run:state', runId),
  getRunLogs: (runId: string) => ipcRenderer.invoke('run:logs', runId),

  getMetrics: () => ipcRenderer.invoke('metrics:get'),
  listTasks: () => ipcRenderer.invoke('tasks:list'),
  getTaskPlan: (taskId: string) => ipcRenderer.invoke('tasks:plan', taskId),
  importTask: (taskInput: any) => ipcRenderer.invoke('tasks:import', taskInput),

  getMcpStatus: () => ipcRenderer.invoke('mcp:status'),
  connectMcp: () => ipcRenderer.invoke('mcp:connect'),
  disconnectMcp: () => ipcRenderer.invoke('mcp:disconnect'),
  takeoverMcp: (active: boolean) => ipcRenderer.invoke('mcp:takeover', active),

  // Settings V2.0 IPC APIs
  getPublicSettings: () => ipcRenderer.invoke('settings:getPublic'),
  saveProviderKey: (payload: { providerId: string; key: string }) =>
    ipcRenderer.invoke('settings:saveProviderKey', payload),
  testProviderConnection: (payload: { providerId: string; draftKey?: string }) =>
    ipcRenderer.invoke('settings:testProviderConnection', payload),
  removeProviderKey: (providerId: string) =>
    ipcRenderer.invoke('settings:removeProviderKey', providerId),
  activateProvider: (providerId: string) =>
    ipcRenderer.invoke('settings:activateProvider', providerId),
  updateSettings: (req: any) =>
    ipcRenderer.invoke('settings:update', req),
  getActiveAiStatus: () =>
    ipcRenderer.invoke('settings:getActiveAiStatus'),

  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url)
});
