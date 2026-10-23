import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  startRun: (payload: { runId: string; targetUrl?: string; taskId?: string; authorizationId?: string }) =>
    ipcRenderer.invoke('run:start', payload),
  pauseRun: (runId: string) => ipcRenderer.invoke('run:pause', runId),
  resumeRun: (runId: string) => ipcRenderer.invoke('run:resume', runId),
  stopRun: (runId: string) => ipcRenderer.invoke('run:stop', runId),
  getRunState: (runId: string) => ipcRenderer.invoke('run:state', runId),
  getRunLogs: (runId: string) => ipcRenderer.invoke('run:logs', runId),
  focusTestingBrowser: (runId?: string) => ipcRenderer.invoke('run:focusBrowser', runId),
  takeoverBrowser: (payload: { runId: string; active: boolean; reason?: string }) =>
    ipcRenderer.invoke('run:takeover', payload),
  checkPageAgain: (runId: string) => ipcRenderer.invoke('run:checkPage', runId),
  validateResumeReadiness: (runId: string) => ipcRenderer.invoke('run:resumeReadiness', runId),
  resumeAfterHumanVerification: (runId: string) => ipcRenderer.invoke('run:resumeVerification', runId),

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

  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  
  // Authorization Manager APIs
  listAuthorizations: () => ipcRenderer.invoke('authorizations:list'),
  getAuthorization: (id: string) => ipcRenderer.invoke('authorizations:get', id),
  createAuthorization: (dto: any) => ipcRenderer.invoke('authorizations:create', dto),
  revokeAuthorization: (id: string, reason?: string) => ipcRenderer.invoke('authorizations:revoke', { id, reason }),
  evaluateTargetAuthorization: (targetUrl: string) => ipcRenderer.invoke('authorizations:evaluate', targetUrl),
  getAuthorizationStatusForTask: (taskId: string) => ipcRenderer.invoke('authorizations:getForTask', taskId)
});
