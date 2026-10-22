/**
 * Unified API Client for Test IO Agent Studio.
 * Seamlessly talks to Electron IPC when running in Electron,
 * or the secure local backend API (http://127.0.0.1:3001) when opened in a browser.
 * Never silently skips execution.
 */

export type RuntimeType = 'electron' | 'browser-api' | 'disconnected';

export interface RuntimeInfo {
  type: RuntimeType;
  label: string;
}

const LOCAL_API_BASE = 'http://127.0.0.1:3001/api';

class ApiClient {
  private cachedRuntime: RuntimeType | null = null;

  public async detectRuntime(): Promise<RuntimeInfo> {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      this.cachedRuntime = 'electron';
      return { type: 'electron', label: 'Electron Native Runtime' };
    }

    try {
      const res = await fetch(`${LOCAL_API_BASE}/health`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        this.cachedRuntime = 'browser-api';
        return { type: 'browser-api', label: 'Local Dev API (Port 3001)' };
      }
    } catch (_) {}

    this.cachedRuntime = 'disconnected';
    return { type: 'disconnected', label: 'Backend Disconnected (No Runtime)' };
  }

  public getRuntimeType(): RuntimeType {
    if (typeof window !== 'undefined' && (window as any).electronAPI) return 'electron';
    return this.cachedRuntime || 'browser-api';
  }

  public async getMetrics() {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      return (window as any).electronAPI.getMetrics();
    }
    const res = await fetch(`${LOCAL_API_BASE}/metrics`);
    if (!res.ok) throw new Error(`Failed to fetch metrics: ${res.statusText}`);
    return res.json();
  }

  public async listTasks() {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      return (window as any).electronAPI.listTasks();
    }
    const res = await fetch(`${LOCAL_API_BASE}/tasks`);
    if (!res.ok) throw new Error(`Failed to list tasks: ${res.statusText}`);
    return res.json();
  }

  public async getTaskPlan(taskId: string) {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.getTaskPlan) {
      return (window as any).electronAPI.getTaskPlan(taskId);
    }
    const res = await fetch(`${LOCAL_API_BASE}/tasks/${encodeURIComponent(taskId)}/plan`);
    if (!res.ok) return null;
    return res.json();
  }

  public async importTask(taskInput: any) {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      return (window as any).electronAPI.importTask(taskInput);
    }
    const res = await fetch(`${LOCAL_API_BASE}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskInput)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to import task: ${res.statusText}`);
    }
    return res.json();
  }

  public async startRun(payload: { runId: string; targetUrl?: string; taskId?: string; authorizationId?: string }) {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      return (window as any).electronAPI.startRun(payload);
    }
    const res = await fetch(`${LOCAL_API_BASE}/run/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to start run: ${res.statusText}`);
    }
    return res.json();
  }

  public async pauseRun(runId: string) {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      return (window as any).electronAPI.pauseRun(runId);
    }
    const res = await fetch(`${LOCAL_API_BASE}/run/pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId })
    });
    return res.json();
  }

  public async resumeRun(runId: string) {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      return (window as any).electronAPI.resumeRun(runId);
    }
    const res = await fetch(`${LOCAL_API_BASE}/run/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId })
    });
    return res.json();
  }

  public async stopRun(runId: string) {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      return (window as any).electronAPI.stopRun(runId);
    }
    const res = await fetch(`${LOCAL_API_BASE}/run/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId })
    });
    return res.json();
  }

  public async getRunState(runId: string) {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      return (window as any).electronAPI.getRunState(runId);
    }
    const res = await fetch(`${LOCAL_API_BASE}/run/${encodeURIComponent(runId)}/state`);
    if (!res.ok) return null;
    return res.json();
  }

  public async getRunLogs(runId: string) {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      return (window as any).electronAPI.getRunLogs(runId);
    }
    const res = await fetch(`${LOCAL_API_BASE}/run/${encodeURIComponent(runId)}/logs`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.logs || [];
  }

  public async getMcpStatus() {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      return (window as any).electronAPI.getMcpStatus();
    }
    const res = await fetch(`${LOCAL_API_BASE}/mcp/status`);
    if (!res.ok) return { isConnected: false, discoveredTools: [] };
    return res.json();
  }

  public async connectMcp() {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      return (window as any).electronAPI.connectMcp();
    }
    const res = await fetch(`${LOCAL_API_BASE}/mcp/connect`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to connect MCP');
    return res.json();
  }

  public async disconnectMcp() {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      return (window as any).electronAPI.disconnectMcp();
    }
    const res = await fetch(`${LOCAL_API_BASE}/mcp/disconnect`, { method: 'POST' });
    return res.json();
  }

  public async takeoverMcp(active: boolean) {
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      return (window as any).electronAPI.takeoverMcp(active);
    }
    const res = await fetch(`${LOCAL_API_BASE}/mcp/takeover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active })
    });
    return res.json();
  }

  public async openExternal(url: string) {
    // Validate scheme
    if (!url.startsWith('https://') && !url.startsWith('http://')) {
      throw new Error('Forbidden URL scheme');
    }

    if (typeof window !== 'undefined' && (window as any).electronAPI?.openExternal) {
      return (window as any).electronAPI.openExternal(url);
    }

    // In browser: try local server or open in new tab with noopener
    try {
      await fetch(`${LOCAL_API_BASE}/open-external`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  // ==========================================
  // Authorization Operations
  // ==========================================
  public async listAuthorizations(): Promise<any[]> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.listAuthorizations) {
      return (window as any).electronAPI.listAuthorizations();
    }
    const res = await fetch(`${LOCAL_API_BASE}/authorizations`);
    if (!res.ok) throw new Error('Failed to list authorizations');
    return res.json();
  }

  public async getAuthorization(id: string): Promise<any> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.getAuthorization) {
      return (window as any).electronAPI.getAuthorization(id);
    }
    const res = await fetch(`${LOCAL_API_BASE}/authorizations/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error('Failed to get authorization');
    return res.json();
  }

  public async createAuthorization(dto: any): Promise<any> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.createAuthorization) {
      return (window as any).electronAPI.createAuthorization(dto);
    }
    const res = await fetch(`${LOCAL_API_BASE}/authorizations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to create authorization');
    }
    return res.json();
  }

  public async revokeAuthorization(id: string, reason?: string): Promise<any> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.revokeAuthorization) {
      return (window as any).electronAPI.revokeAuthorization(id, reason);
    }
    const res = await fetch(`${LOCAL_API_BASE}/authorizations/${encodeURIComponent(id)}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to revoke authorization');
    }
    return res.json();
  }

  public async evaluateTargetAuthorization(targetUrl: string): Promise<any> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.evaluateTargetAuthorization) {
      return (window as any).electronAPI.evaluateTargetAuthorization(targetUrl);
    }
    const res = await fetch(`${LOCAL_API_BASE}/authorizations/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUrl })
    });
    if (!res.ok) throw new Error('Failed to evaluate authorization');
    return res.json();
  }

  public async getAuthorizationStatusForTask(taskId: string): Promise<any> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.getAuthorizationStatusForTask) {
      return (window as any).electronAPI.getAuthorizationStatusForTask(taskId);
    }
    const res = await fetch(`${LOCAL_API_BASE}/tasks/${encodeURIComponent(taskId)}/authorization-status`);
    if (!res.ok) throw new Error('Failed to get task authorization status');
    return res.json();
  }

  // ==========================================
  // Settings V2.0 APIs
  // ==========================================

  public async getPublicSettings(): Promise<any> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.getPublicSettings) {
      return (window as any).electronAPI.getPublicSettings();
    }
    const res = await fetch(`${LOCAL_API_BASE}/settings`);
    if (!res.ok) throw new Error(`Failed to fetch settings: ${res.statusText}`);
    return res.json();
  }

  public async saveProviderKey(providerId: string, key: string): Promise<any> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.saveProviderKey) {
      return (window as any).electronAPI.saveProviderKey({ providerId, key });
    }
    const res = await fetch(`${LOCAL_API_BASE}/settings/save-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId, key })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to save key: ${res.statusText}`);
    }
    return res.json();
  }

  public async testProviderConnection(providerId: string, draftKey?: string): Promise<any> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.testProviderConnection) {
      return (window as any).electronAPI.testProviderConnection({ providerId, draftKey });
    }
    const res = await fetch(`${LOCAL_API_BASE}/settings/test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId, draftKey })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to test connection: ${res.statusText}`);
    }
    return res.json();
  }

  public async removeProviderKey(providerId: string): Promise<boolean> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.removeProviderKey) {
      return (window as any).electronAPI.removeProviderKey(providerId);
    }
    const res = await fetch(`${LOCAL_API_BASE}/settings/remove-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId })
    });
    return res.ok;
  }

  public async activateProvider(providerId: string): Promise<any> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.activateProvider) {
      return (window as any).electronAPI.activateProvider(providerId);
    }
    const res = await fetch(`${LOCAL_API_BASE}/settings/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to activate provider: ${res.statusText}`);
    }
    return res.json();
  }

  public async updateSettings(req: any): Promise<any> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.updateSettings) {
      return (window as any).electronAPI.updateSettings(req);
    }
    const res = await fetch(`${LOCAL_API_BASE}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req)
    });
    return res.json();
  }

  public async getActiveAiStatus(): Promise<any> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.getActiveAiStatus) {
      return (window as any).electronAPI.getActiveAiStatus();
    }
    const settings = await this.getPublicSettings().catch(() => null);
    return settings?.activeRuntime || null;
  }
}


export const apiClient = new ApiClient();
